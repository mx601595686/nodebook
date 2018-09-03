import * as React from 'react';

import { FoldableContainer } from '../../../../../../../../global/Component/FoldableContainer/FoldableContainer';

const less = require('./FileBrowser.less');

/**
 * 文件资源浏览器
 */
export class FileBrowser extends FoldableContainer {

    constructor(props: any, context: any) {
        super(props, context);
        this._classNames.push(less.FileBrowser);
    }

    componentDidMount() {
        super.componentDidMount();

    }

    componentWillUnmount() {
        super.componentWillUnmount();

    }

    protected renderTitleBar(): JSX.Element {
        return (
            <div className={less.titleButtons}>
                <i title="新建文件" className="iconfont icon-file-add-fill" onClick={e => e.stopPropagation()} />
                <i title="新建文件夹" className="iconfont icon-file2" onClick={e => e.stopPropagation()} />
                <i title="刷新" className="iconfont icon-fresh" onClick={e => e.stopPropagation()} />
                <i title="全部折叠" className="iconfont icon-iconcloseall" onClick={e => e.stopPropagation()} />
            </div>
        );
    }

    protected renderContent(): JSX.Element {
        return (
            <pre style={{color:'white'}}>
                {'content\n'.repeat(100)}
            </pre>
        );
    }
}