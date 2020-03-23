export type IURLSearchParams = URLSearchParams & URLSearchParamsExtended;

export interface IURLSearchParamsInit {
  defaultMergeOptions?: ISearchParamsMergeOptions
  defaultStringifyOptions?: ISearchParamsStringifyOptions
}

export interface ISearchParamsMergeOptions {
  joinArrays?: boolean
  joinArraysWith?: string
  skipEmptyValues?: boolean
}

export interface ISearchParamsStringifyOptions {
  withPrefix?: boolean;
  encoder?: (value: string) => string;
}

export abstract class URLSearchParamsExtended {
  private static defaultOptions = new WeakMap<URLSearchParams, IURLSearchParamsInit>();

  static create(search: string | URLSearchParams, init: IURLSearchParamsInit = {}, onChange?: (newSearch: string) => void) {
    let searchParams = new URLSearchParams(search) as IURLSearchParams;
    let searchParamsExtras = Object.getOwnPropertyDescriptors(URLSearchParamsExtended.prototype);
    delete searchParamsExtras.constructor;
    Object.defineProperties(searchParams, searchParamsExtras);

    URLSearchParamsExtended.defaultOptions.set(searchParams, {
      defaultMergeOptions: Object.assign({
        joinArrays: true,
        joinArraysWith: ",",
        skipEmptyValues: true,
      }, init.defaultMergeOptions),
      defaultStringifyOptions: Object.assign({
        encoder: encodeURI,
        withPrefix: false,
      }, init.defaultStringifyOptions)
    });

    if (!onChange) {
      return searchParams;
    }
    return new Proxy(searchParams, {
      get(target, prop: string | symbol | any, context: any) {
        let keyRef = Reflect.get(target, prop, context);
        if (typeof keyRef === "function") {
          return (...args: any[]) => {
            let oldValue = target.toString();
            let result = Reflect.apply(keyRef, target, args);
            let newValue = target.toString()
            if (oldValue !== target.toString()) onChange(newValue)
            return result
          };
        }
        return keyRef;
      }
    })
  }

  getAsArray(this: IURLSearchParams, name: string, splitter?: string | RegExp) {
    const { joinArraysWith } = URLSearchParamsExtended.defaultOptions.get(this).defaultMergeOptions;
    splitter = splitter || joinArraysWith
    const data = this.get(name);
    return data ? data.split(splitter) : []
  }

  merge<T>(
    this: IURLSearchParams,
    params: T & Record<string, any | any[]>,
    options?: ISearchParamsMergeOptions,
  ) {
    const copy = this.copyWith(params, options);
    Array.from(this.keys()).forEach(key => this.delete(key))
    Array.from(copy.entries()).forEach(([key, value]) => this.append(key, value))
  }

  copyWith<T>(
    this: IURLSearchParams,
    params: T & Record<string, any | any[]>,
    options: ISearchParamsMergeOptions = {}
  ) {
    const copyInit: IURLSearchParamsInit = Object.assign({}, URLSearchParamsExtended.defaultOptions.get(this));
    copyInit.defaultMergeOptions = {
      ...copyInit.defaultMergeOptions,
      ...options,
    }
    const copy = URLSearchParamsExtended.create(this, copyInit);
    if (!params) {
      return copy;
    }
    const { joinArrays, joinArraysWith, skipEmptyValues } = copyInit.defaultMergeOptions;
    Object.entries(params).forEach(([name, value]) => {
      copy.delete(name);
      if (Array.isArray(value)) {
        if (skipEmptyValues && !value.length) return;
        if (joinArrays) copy.append(name, value.join(joinArraysWith))
        else value.forEach(val => copy.append(name, val))
      }
      else {
        if (value == null) value = ""
        if (skipEmptyValues && !String(value).length) return;
        copy.append(name, value)
      }
    })
    return copy;
  }

  toString(this: IURLSearchParams, options: ISearchParamsStringifyOptions = {}) {
    const { encoder, withPrefix } = {
      ...URLSearchParamsExtended.defaultOptions.get(this).defaultStringifyOptions,
      ...options
    };
    const prefix = withPrefix ? "?" : "";
    if (encoder === encodeURIComponent) {
      return prefix + URLSearchParams.prototype.toString.call(this)
    }
    else {
      return prefix + Array.from(this)
        .map(([key, value]) => `${key}=${encoder(value)}`)
        .join("&")
    }
  }
}
