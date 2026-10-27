import { HttpHeaders } from '@angular/common/http';
import { Configuration } from './configuration';

export class BaseService {
    protected basePath = 'http://localhost/api/v3';
    public defaultHeaders = new HttpHeaders();
    public configuration: Configuration;

    constructor(basePath?: string|string[], configuration?: Configuration) {
        this.configuration = configuration || new Configuration();
        if (typeof this.configuration.basePath !== 'string') {
            this.configuration.basePath = Array.isArray(basePath) ? basePath[0] : (basePath ?? this.basePath);
        }
    }
}
