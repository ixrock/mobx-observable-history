import { intercept, observable, reaction, transaction } from "mobx";
import { createBrowserHistory, createLocation, createPath, History, Location, LocationDescriptor, locationsAreEqual, UnregisterCallback } from "history";

export interface IObservableHistory<S = any> extends History<S> {
  searchParams: IURLSearchParamsExtended;
  getPath(): string;
  merge(location: LocationDescriptor<S>, replace?: boolean): void;
  destroy(): History<S>;
}

export interface IObservableHistoryInit {
  searchParams?: IURLSearchParamsInit
}

export function createObservableHistory<S>(history = createBrowserHistory<S>(), options: IObservableHistoryInit = {}): IObservableHistory<S> {
  const disposers: UnregisterCallback[] = []

  const data = observable({
    action: history.action,
    location: observable.object(history.location, {
      state: observable.struct
    }),
    searchParams: createSearchParams(),
  });

  function createSearchParams(search = history.location.search) {
    return URLSearchParamsExtended.create(search, options.searchParams, syncSearchParams);
  }

  function syncSearchParams(search: string) {
    if (data.location.search !== normalize(data.searchParams.toString())) {
      data.location.search = search
      data.searchParams = createSearchParams(search)
    }
  }

  function setLocation(location: string | Location<S>) {
    if (typeof location === "string") {
      location = createLocation(location)
    }
    if (!locationsAreEqual(data.location, location)) {
      transaction(() => {
        Object.assign(data.location, location)
      })
    }
  }

  function normalize(chunk: string, prefix = "?") {
    chunk = String(chunk).trim()
    if (!chunk || chunk == prefix) return ""
    if (chunk.startsWith(prefix)) return chunk
    return prefix + chunk
  }

  disposers.push(
    // update search-params object
    reaction(() => data.location.search, syncSearchParams),

    // update url when history.location modified directly
    reaction(() => createPath(data.location), path => {
      let historyPath = createPath(history.location);
      if (historyPath !== path) {
        history.push(createLocation(path))
      }
    }),

    // normalize values for direct updates of history.location
    intercept(data.location, change => {
      if (change.type === "update") {
        switch (change.name) {
          case "search":
            change.newValue = normalize(change.newValue, "?")
            break;
          case "hash":
            change.newValue = normalize(change.newValue, "#")
            break;
        }
      }
      return change
    }),

    // update observables from history change event
    history.listen((location, action) => {
      data.action = action
      setLocation(location)
    })
  )

  return Object.create(history, {
    action: {
      configurable: true,
      get() {
        return data.action
      }
    },
    location: {
      configurable: true,
      set: setLocation,
      get() {
        return data.location
      }
    },
    searchParams: {
      configurable: true,
      get() {
        return data.searchParams;
      },
      set(value: string | URLSearchParams) {
        data.location.search = String(value)
      },
    },
    getPath: {
      value() {
        return createPath(data.location)
      }
    },
    merge: {
      value(newLocation: LocationDescriptor<S>, replace = false) {
        if (typeof newLocation === "string") {
          newLocation = createLocation(newLocation);
          Object.entries(newLocation).forEach(([param, value]) => {
            if (!value) {
              // @ts-ignore remove empty strings from parsed location
              delete newLocation[param];
            }
          })
        }
        newLocation = { ...data.location, ...newLocation };
        if (replace) history.replace(newLocation);
        else history.push(newLocation)
      }
    },
    destroy: {
      value(this: IObservableHistory<S>) {
        disposers.forEach(dispose => dispose())
        delete this.location;
        delete this.action;
        delete this.searchParams;
        return Object.getPrototypeOf(this)
      }
    }
  })
}

export interface IURLSearchParamsExtended extends URLSearchParamsExtended, URLSearchParams {
}

interface IURLSearchParamsInit {
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

export class URLSearchParamsExtended implements Omit<IURLSearchParamsExtended, keyof URLSearchParams> {
  private static defaultOptions = new WeakMap<URLSearchParams, IURLSearchParamsInit>();

  static create(search: string | URLSearchParams, init: IURLSearchParamsInit = {}, onChange?: (newSearch: string) => void) {
    let searchParams = new URLSearchParams(search) as IURLSearchParamsExtended;
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

  getAsArray(this: IURLSearchParamsExtended, name: string, splitter?: string | RegExp) {
    const { joinArraysWith } = URLSearchParamsExtended.defaultOptions.get(this).defaultMergeOptions;
    splitter = splitter || joinArraysWith
    const data = this.get(name);
    return data ? data.split(splitter) : []
  }

  merge<T>(
    this: IURLSearchParamsExtended,
    params: T & Record<string, any | any[]>,
    options?: ISearchParamsMergeOptions,
  ) {
    const copy = this.copyWith(params, options);
    Array.from(this.keys()).forEach(key => this.delete(key))
    Array.from(copy.entries()).forEach(([key, value]) => this.append(key, value))
  }

  copyWith<T>(
    this: IURLSearchParamsExtended,
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

  toString(this: IURLSearchParamsExtended, options: ISearchParamsStringifyOptions = {}) {
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

export default createObservableHistory;
