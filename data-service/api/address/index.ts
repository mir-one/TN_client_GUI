import { request } from '../../utils/request';
import { get as configGet } from '../../config';
import { get } from '../assets/assets';
import { Money } from '@tn/data-entities';


export function getScriptInfo(address: string): Promise<IScriptInfo<Money>> {
    return Promise.all([
        get('TN'),
        request<IScriptInfo<number | string>>({ url: `${configGet('node')}/addresses/scriptInfo/${address}` })
    ]).then(([asset, info]) => {
        return { ...info, extraFee: new Money(info.extraFee, asset) };
    });
}

export interface IScriptInfo<LONG> {
    address: string;
    script?: string;
    scriptText?: string;
    complexity: number;
    extraFee: LONG;
}
