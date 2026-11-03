// Created by ng-openapi-mock. Commit this file.
//
// Stands in for the generated mock interceptor when it isn't there, so
// app.config.ts can import mockApiInterceptor from '@mock-api' and be
// committed: developers without the mocks get this one, and every request
// goes to the real API.
import { HttpInterceptorFn } from '@angular/common/http';

export const mockApiInterceptor: HttpInterceptorFn = (req, next) => next(req);
