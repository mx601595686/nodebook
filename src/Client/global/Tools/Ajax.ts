import { ObservableVariable } from "observable-variable";

/**
 * 包装jquery的 Ajax 方法 
 */
function Ajax(method: 'GET' | 'POST', url: string, data: any, setting: JQuery.AjaxSettings = {}) {
    let ajax: JQuery.jqXHR<any> = undefined as any;

    const promise: { abort: () => void } & Promise<string> = new Promise((resolve, reject) => {
        ajax = jQuery.ajax({
            url,
            type: method,
            data,
            dataType: 'text',   //避免jquery执行js文件
            cache: false,
            timeout: 1000 * 60 * 2,
            error(jqXHR) {
                const err: any = new Error(jqXHR.responseText);
                err.statusCode = jqXHR.status;
                reject(err);
            },
            success(data) {
                resolve(data);
            },
            ...setting
        });
    }) as any;

    promise.abort = ajax.abort;
    return promise;
}

export function Get(url: string, data?: { [key: string]: any }, cache: boolean = false) {
    return Ajax('GET', url, data, { cache });
}

export function Post(url: string, data?: { [key: string]: any }, file?: Blob, progress?: ObservableVariable<number>) {
    if (file) {
        const formData = new FormData();
        jQuery.each(data, (key: string, value) => formData.append(key, value));
        formData.append('file', file);

        if (progress) {
            return Ajax('POST', url, formData, {
                processData: false,
                contentType: false,
                xhr: function () {
                    const xhr = new XMLHttpRequest();
                    xhr.upload.addEventListener("progress", function (evt) {
                        if (evt.lengthComputable)
                            progress.value = evt.loaded / evt.total * 100;
                    }, false);
                    return xhr;
                }
            });
        } else
            return Ajax('POST', url, formData, { processData: false, contentType: false });
    } else
        return Ajax('POST', url, data);
}