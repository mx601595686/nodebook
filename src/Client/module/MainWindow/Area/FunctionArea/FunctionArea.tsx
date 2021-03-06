import * as React from 'react';
import { ObservableVariable, permanent_oVar } from 'observable-variable';

import { ObservableComponent } from "../../../../global/Tools/ObservableComponent";
import { Splitter } from '../../../../global/Component/Splitter/Splitter';
import { FileManager } from './FunctionPanel/FileManager/FileManager';
import { ShortcutManager } from './FunctionPanel/ShortcutManager/ShortcutManager';
import { TaskManager } from './FunctionPanel/TaskManager/TaskManager';
import { ServiceManager } from './FunctionPanel/ServiceManager/ServiceManager';

const less = require('./FunctionArea.less');

/**
 * 确定显示哪一种功能区
 * 'file'：     文件列表，资源管理器
 * 'task'：     任务管理器
 * 'service'：  服务列表
 * 'shortcut'： 快捷方式
 *  null：      不显示功能区
 */
export const displayType: ObservableVariable<'file' | 'task' | 'shortcut' | 'service' | null> =
    permanent_oVar<any>('ui.FunctionArea._displayType', { defaultValue: 'file' });

/**
 * 侧边栏，功能区按钮
 */
export class FunctionArea extends ObservableComponent {

    private readonly _width = permanent_oVar('ui.FunctionArea._width', { defaultValue: 300 });    //功能区的宽度

    componentDidMount() {
        this.watch([this._width, displayType], 0);
    }

    render() {
        return (
            <div id="FunctionArea" style={{ width: this._width.value, display: displayType.value === null ? 'none' : 'block' }}>
                <Splitter className={less.splitter} onChange={position => this._width.value = position - 57 /* 不是60是因为分隔条还有3像素宽 */} />
                <div className={less.content}>
                    <ShortcutManager />
                    <FileManager />
                    <TaskManager />
                    <ServiceManager />
                </div>
            </div>
        );
    }
}