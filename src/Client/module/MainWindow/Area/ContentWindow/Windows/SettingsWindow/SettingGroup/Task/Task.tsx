import * as React from 'react';
import { ObservableVariable } from 'observable-variable';

import { ObservableComponentWrapper } from '../../../../../../../../global/Tools/ObservableComponent';
import { NumberInput } from '../../../../../../../../global/Component/NumberInput/NumberInput';
import { normalSettings } from '../../../../../../../../global/SystemSetting';
import { BaseSettingGroup } from "../BaseSettingGroup/BaseSettingGroup";

const less = require('../CodeEditor/CodeEditor.less');

export class Task extends BaseSettingGroup {

    private readonly _listRefreshInterval = normalSettings.get('client.task.listRefreshInterval') as ObservableVariable<number>;
    private readonly _logRefreshInterval = normalSettings.get('client.task.logRefreshInterval') as ObservableVariable<number>;

    protected _groupName = '任务';

    protected _subGroup = [
        {
            name: '列表刷新时间间隔',
            description: '(毫秒)',
            items: [
                (
                    <ObservableComponentWrapper watch={[this._listRefreshInterval]}
                        render={() => <NumberInput className={less.numberInput} min={100} max={60 * 60 * 1000} step={1} value={this._listRefreshInterval} />} />
                )
            ]
        },
        {
            name: '日志刷新时间间隔',
            description: '(毫秒)',
            items: [
                (
                    <ObservableComponentWrapper watch={[this._logRefreshInterval]}
                        render={() => <NumberInput className={less.numberInput} min={100} max={60 * 60 * 1000} step={1} value={this._logRefreshInterval} />} />
                )
            ]
        },
    ];
}