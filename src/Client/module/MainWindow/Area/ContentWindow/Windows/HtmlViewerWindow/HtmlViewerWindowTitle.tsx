import { getIconPath } from '../../../../../../global/Component/FileIcon/GetIconPath';
import { BaseWindowTitle } from '../BaseWindow/BaseWindowTitle';
import { HtmlViewerWindowArgs } from '../../ContentWindowTypes';

export class HtmlViewerWindowTitle extends BaseWindowTitle<HtmlViewerWindowArgs> {

    protected _prompt = this.props.args.args.path;
    protected _icon = `/static/res/img/file_icons/${getIconPath('.html')}`;

    constructor(props: any, context: any) {
        super(props, context);

        this._communicator.loading = this._loading;
        this._loading.value = true;
    }
}