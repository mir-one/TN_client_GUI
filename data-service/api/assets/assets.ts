import { Asset, Money, BigNumber } from '@tn/data-entities';
import { get as configGet, getDataService } from '../../config';
import { request } from '../../utils/request';
import { IBalanceItem, assetsApi } from './interface';
import { TN_ID } from '@tn/signature-generator';
import { assetStorage } from '../../utils/AssetStorage';
import { clearTransferFee, normalizeAssetId, setTransferFeeItem, toArray, toHash } from '../../utils/utils';
import { isEmpty } from 'ts-utils';
import { IHash } from '../../interface';

const MAX_ASSETS_IN_REQUEST = 30;

export function get(id: string): Promise<Asset>;
export function get(idList: Array<string>): Promise<Array<Asset>>;

export function get(assets: string | Array<string>): Promise<any> {
    return assetStorage.getAssets(toArray(assets), getAssetRequestCb)
        .then((list) => {
            if (typeof assets === 'string') {
                return list[0];
            } else {
                return list;
            }
        });
}

export function getAssetFromNode(assetId: string): Promise<Asset> {
    if (assetId === TN_ID) {
        return Promise.resolve(new Asset({
            ticker: 'TN',
            id: 'TN',
            name: 'TurtleNetwork',
            precision: 8,
            description: '',
            height: 0,
            hasScript: false,
            timestamp: new Date('2016-04-11T21:00:00.000Z'),
            minSponsoredFee: new BigNumber(0),
            sender: '',
            quantity: 10000000000000000,
            reissuable: false
        }));
    }

    return request<INodeAssetData>({ url: `${configGet('node')}/assets/details/${assetId}` })
        .then((data) => new Asset({
            id: data.assetId,
            name: data.name,
            description: data.description,
            height: data.issueHeight,
            precision: data.decimals,
            quantity: data.quantity,
            hasScript: !!data.script,
            reissuable: data.reissuable,
            minSponsoredFee: data.minSponsoredFee,
            sender: data.issuer,
            timestamp: new Date(data.issueTimestamp)
        }));
}

export function balanceList(address: string, txHash?: IHash<Money>, ordersHash?: IHash<Money>): Promise<Array<IBalanceItem>> {
    return Promise.all([
        tnBalance(address),
        assetsBalance(address)
    ])
        .then(([tn, balances]) => applyTxAndOrdersDif([tn].concat(balances), txHash, ordersHash));
}

export function tnBalance(address: string): Promise<IBalanceItem> {
    return Promise.all([
        get(TN_ID),
        request<assetsApi.ITnBalance>({ url: `${configGet('node')}/addresses/balance/details/${address}` })
    ]).then(([tn, details]) => remapTnBalance(tn, details));
}

export function assetsBalance(address: string): Promise<Array<IBalanceItem>> {
    return request({ url: `${configGet('node')}/assets/balance/${address}` })
        .then((data: assetsApi.IBalanceList) => {
            data.balances.forEach((asset) => {
                assetStorage.updateAsset(asset.assetId, new BigNumber(asset.quantity), asset.reissuable);
            });
            return getAssetsByBalanceList(data)
                .then((assets) => {
                    const hash = toHash(assets, 'id');
                    return remapAssetsBalance(data, hash);
                });
        });
}

export function remapTnBalance(tn: Asset, data: assetsApi.ITnBalance): IBalanceItem {
    const inOrders = new Money(0, tn);
    const regular = new Money(data.regular, tn);
    const available = new Money(data.available, tn);
    const leasedOut = new Money(data.regular, tn).sub(available);
    const leasedIn = new Money(data.effective, tn).sub(available);

    return {
        asset: tn,
        regular,
        available,
        inOrders,
        leasedOut,
        leasedIn
    };
}

export function remapAssetsBalance(data: assetsApi.IBalanceList, assetsHash: IHash<Asset>): Array<IBalanceItem> {
    clearTransferFee();
    return data.balances.map((assetData) => {
        const asset = assetsHash[assetData.assetId];
        const inOrders = new Money(new BigNumber('0'), asset);
        const regular = new Money(new BigNumber(assetData.balance), asset);
        const available = regular.sub(inOrders);
        const empty = new Money(new BigNumber('0'), asset);
        const balance = isEmpty(assetData.sponsorBalance) ? null : new Money(assetData.sponsorBalance as string, assetsHash[TN_ID]);
        const fee = isEmpty(assetData.minSponsoredAssetFee) ? null : new Money(assetData.minSponsoredAssetFee as string, asset);
        const { issueTransaction } = assetData;
        const { sender } = issueTransaction;
        const isMy = sender === data.address;
        if (balance && fee) {
            setTransferFeeItem({ balance, fee, isMy });
        }

        return {
            asset,
            regular,
            available,
            inOrders,
            leasedOut: empty,
            leasedIn: empty,
        };
    }).sort(((a, b) => a.asset.name > b.asset.name ? 1 : a.asset.name === b.asset.name ? 0 : -1));
}

export function applyTxAndOrdersDif(balance: IBalanceItem, txHash?: IHash<Money>, ordersHash?: IHash<Money>): IBalanceItem;
export function applyTxAndOrdersDif(balance: Array<IBalanceItem>, txHash?: IHash<Money>, ordersHash?: IHash<Money>): Array<IBalanceItem>;
export function applyTxAndOrdersDif(balance: IBalanceItem | Array<IBalanceItem>, txHash?: IHash<Money>, ordersHash?: IHash<Money>): IBalanceItem | Array<IBalanceItem> {
    const list = toArray(balance);
    txHash = txHash || Object.create(null);
    ordersHash = ordersHash || Object.create(null);
    list.forEach((balance) => {
        balance.regular = moneyDif(balance.regular, txHash[balance.asset.id]);
        balance.available = moneyDif(balance.available, txHash[balance.asset.id], ordersHash[balance.asset.id]);
        balance.inOrders = ordersHash[balance.asset.id] || new Money(new BigNumber(0), balance.asset);
    });
    if (Array.isArray(balance)) {
        return list;
    }
    return list[0];
}

export function moneyDif(target: Money, ...toDif: Array<Money>): Money {
    const result = toDif.filter(Boolean).reduce((result, toSub) => {
        return result.sub(toSub);
    }, target);
    if (result.getTokens().lt(0)) {
        return result.cloneWithCoins('0');
    } else {
        return result;
    }
}

export function getAssetsByBalanceList(data: assetsApi.IBalanceList): Promise<Array<Asset>> {
    return get([TN_ID, ...data.balances.map((balance) => normalizeAssetId(balance.assetId))]);
}

const splitRequest = (list: string[], getData) => {

    const newList = [...list];
    const requests = [];

    while (newList.length) {
        const listPart = newList.splice(0, MAX_ASSETS_IN_REQUEST);
        const result = getData(listPart);
        const timeout = wait(5000).then(() => ({ data: listPart.map(() => null) }));
        requests.push(Promise.race([result, timeout]));
    }

    return Promise.all(requests).then((results) => {
        let data = [];
        for (const items of results) {
            data = [...data, ...items.data];
        }
        return { data };
    }).catch(e => ({ data: list.map(() => null) }));
};

const getAssetRequestCb = (list: Array<string>): Promise<Array<Asset>> => {
    const ds = getDataService();
    return splitRequest(list as any, ds.getAssets as any)  //TODO delete after modify client lib
        .then((response) => {
            const assets = response.data;
            const fails = [];

            list.forEach((id, index) => {
                if (!assets[index]) {
                    fails.push(id);
                }
            });

            return queueRequest(fails)
                .then((reloadedAssets) => {
                    let failCount = 0;
                    return list.map((id, index) => {
                        if (assets[index]) {
                            return assets[index];
                        } else {
                            return reloadedAssets[failCount++];
                        }
                    });
                });
        });
};

export async function queueRequest(list: Array<string>) {
    const result = [];
    for (const assetId of list) {
        const asset = await getAssetFromNode(assetId);
        result.push(asset);
    }
    return result;
}

export const wait = time => new Promise(resolve => setTimeout(resolve, time));

export interface INodeAssetData {
    assetId: string;
    complexity: number;
    decimals: number;
    description: string;
    extraFee: number;
    issueHeight: number;
    issueTimestamp: number;
    issuer: string;
    name: string;
    minSponsoredFee: string | number;
    quantity: string | number;
    reissuable: boolean;
    script: string | null;
}
