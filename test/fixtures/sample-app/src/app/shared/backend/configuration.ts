import { HttpParameterCodec } from '@angular/common/http';

export interface ConfigurationParameters {
    basePath?: string;
    withCredentials?: boolean;
}

export class Configuration {
    basePath?: string;
    withCredentials?: boolean;
    encoder?: HttpParameterCodec;

    constructor(params: ConfigurationParameters = {}) {
        this.basePath = params.basePath;
        this.withCredentials = params.withCredentials;
    }

    public encodeParam(param: { name: string; value: unknown; in: string; style: string; explode: boolean; dataType: string; dataFormat: string | undefined }): string {
        return encodeURIComponent(String(param.value));
    }
}
