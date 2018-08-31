import * as React from 'react';
import { oVar, oArr, ObservableVariable } from 'observable-variable';

import { ObservableComponent } from '../../global/Tools/ObservableComponent';
import { SideBar } from './Area/SideBar/SideBar';
import { DisplayType } from './Area/FunctionArea/FunctionAreaPropsType';
import { showLogWindow } from './Area/LogWindow/LogWindowPropsType';
import { openedWindows } from './Area/ContentWindow/ContentWindowPropsType';
import { fileManagerNumber, serviceManagerErrorNumber } from './Area/SideBar/SideBarPropsType';
import { FunctionArea } from './Area/FunctionArea/FunctionArea';
import { LogWindow } from './Area/LogWindow/LogWindow';

const less = require('./MainWindow.less');

/**
 * 程序的主窗体
 */
export class MainWindow extends ObservableComponent<{ logged: ObservableVariable<boolean> }> {

    private readonly _functionAreaDisplayType: DisplayType = oVar('shortcut') as any;
    private readonly _showLogWindow: showLogWindow = oVar(false);
    private readonly _openedWindows_left: openedWindows = oArr([]) as any;
    private readonly _openedWindows_right: openedWindows = oArr([]) as any;
    private readonly _fileManagerNumber: fileManagerNumber = oVar(0);
    private readonly _serviceManagerErrorNumber: serviceManagerErrorNumber = oVar(0);

    componentDidMount() {
        this.watch(this.props.logged);
    }

    render() {
        if (this.props.logged.value) {
            return (
                <div id="MainWindow">
                    <SideBar functionAreaDisplayType={this._functionAreaDisplayType}
                        showLogWindow={this._showLogWindow}
                        openedWindows={this._openedWindows_left}
                        fileManagerNumber={this._fileManagerNumber}
                        serviceManagerErrorNumber={this._serviceManagerErrorNumber} />
                    <FunctionArea functionAreaDisplayType={this._functionAreaDisplayType}
                        fileManagerNumber={this._fileManagerNumber}
                        serviceManagerErrorNumber={this._serviceManagerErrorNumber} />
                    <div className={less.right}>
                        <LogWindow />
                    </div>
                </div>
            );
        } else
            return false;
    }
}