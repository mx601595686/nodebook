import * as https from 'https';
import * as koa from 'koa';
import * as request from 'request-promise-native';
import * as koa_compress from 'koa-compress';
import * as koa_router from 'koa-router';
import koa_response_time = require('koa-response-time');
import { BaseServiceModule } from "service-starter";
import { ObservableVariable } from 'observable-variable';

import { SystemSetting } from '../SystemSetting/SystemSetting';
import { OpenSSLCertificate } from '../OpenSSLCertificate/OpenSSLCertificate';

import { ErrorHandling } from './Middleware/ErrorHandling';
import { HealthChecking } from './Middleware/HealthChecking';
import { VisitRestriction } from './Middleware/VisitRestriction';
import { Favicon } from './Middleware/Favicon';
import { VisitLogger } from './Middleware/VisitLogger';
import { ClientStaticFileSender } from './Middleware/ClientStaticFileSender';
import { ApiRouter } from './Middleware/ApiRouter';

export class HttpServer extends BaseServiceModule {

    private _systemSetting: SystemSetting;
    private _openSSLCertificate: OpenSSLCertificate;
    private _healthCheckingUrlPath: ObservableVariable<string>;

    private _httpServer: https.Server;
    private _koaServer: koa;

    /**
     * 注册koa中间件
     */
    private async _registerMiddleware() {
        this._koaServer.use(HealthChecking(this._systemSetting));
        this._koaServer.use(VisitRestriction(this._systemSetting));
        this._koaServer.use(VisitLogger());
        this._koaServer.use(ErrorHandling());
        this._koaServer.use(koa_response_time());
        this._koaServer.use(koa_compress());    //response 头部如果设置了 Content-Encoding 则会使这个无效

        const router = new koa_router();

        router.get('favicon', '/favicon.ico', Favicon(this._systemSetting));
        router.get('static', '/static/:path(.+?\\..+)', ClientStaticFileSender());
        router.use('/api', ApiRouter(this._systemSetting));

        router.redirect('/', '/static/index.html');

        this._koaServer.use(router.routes());
    }

    async onStart(): Promise<void> {
        this._systemSetting = this.services.SystemSetting;
        this._openSSLCertificate = this.services.OpenSSLCertificate;
        this._healthCheckingUrlPath = this._systemSetting.normalSettings.get('_internal.healthCheckingUrlPath') as any;

        this._koaServer = new koa();
        this._httpServer = https.createServer({ key: this._openSSLCertificate.privkey, cert: this._openSSLCertificate.cert }, this._koaServer.callback());

        await this._registerMiddleware();

        this._httpServer.listen(443);
    }

    onStop(): Promise<void> {
        return new Promise(resolve => {
            this._httpServer.close(resolve);
        });
    }

    async onHealthCheck(): Promise<void> {
        const result = (await request.post(`https://${process.env.DOMAIN}${this._healthCheckingUrlPath.value}`, { ca: this._openSSLCertificate.cert })).toString();
        if ("OK" !== result)
            throw new Error(`健康检查的返回值错误。${result}`);
    }
}