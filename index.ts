import { intercept, observable, reaction, transaction } from "mobx";
import { createBrowserHistory, createLocation, createPath, History, Location, LocationDescriptor, locationsAreEqual, UnregisterCallback } from "history";

export interface IObservableHistory<S = any> extends History<S> {
  searchParams: IURLSearchParams;
  getPath(): string;
  merge(location: LocationDescriptor<S>, replace?: boolean): void;
  destroy(): History<S>;
}

export type IParamEncoder = (value: string) => string

export interface IObservableHistoryOptions {
  uriParamDefaultEncoder?: IParamEncoder
}

export interface ISearchParamsToStringOptions {
  encoder?: IParamEncoder;
  withPrefix?: boolean;
}

export interface IURLSearchParams extends URLSearchParams {
  uriParamDefaultEncoder: IParamEncoder
  getArray(name: string, splitter?: string | RegExp): string[];
  merge(names: Record<string, string | string[]> | URLSearchParams, options?: IParamsUpdateOptions): void;
  copyWith(names: Record<string, string | string[]> | URLSearchParams, options?: IParamsUpdateOptions): IURLSearchParams;
  toString(options?: ISearchParamsToStringOptions): string;
}

export interface IParamsUpdateOptions {
  joinArrays?: boolean
}

export function createObservableHistory<S>(history = createBrowserHistory<S>(), options: IObservableHistoryOptions = {}): IObservableHistory<S> {
  const { uriParamDefaultEncoder = encodeURI } = options;
  const disposers: UnregisterCallback[] = []

  const data = observable({
    action: history.action,
    location: observable.object(history.location, {
      state: observable.struct
    }),
    searchParams: createSearchParams(),
  });

  function createSearchParams(search = history.location.search) {
    let params = createExtendedSearchParams(search, syncSearchParams);
    params.uriParamDefaultEncoder = uriParamDefaultEncoder;
    return params;
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

const searchParamsExtras: Omit<IURLSearchParams, keyof URLSearchParams> = {
  uriParamDefaultEncoder: encodeURI,
  getArray(this: IURLSearchParams, name: string, splitter: string | RegExp = ",") {
    let data = this.get(name);
    return data ? data.split(splitter) : []
  },
  merge(
    this: IURLSearchParams,
    params: Record<string, string | string[]> | URLSearchParams,
    options?: IParamsUpdateOptions
  ) {
    let copy = this.copyWith(params, options);
    Array.from(this.keys()).forEach(key => this.delete(key))
    Array.from(copy.entries()).forEach(([key, value]) => this.append(key, value))
  },
  copyWith(
    this: IURLSearchParams,
    params: Record<string, string | string[]> | URLSearchParams,
    { joinArrays = true }: IParamsUpdateOptions = {}
  ) {
    let copy = createExtendedSearchParams(this);
    if (!params) return copy;
    let entries = params instanceof URLSearchParams ? Array.from(params.entries()) : Object.entries(params)
    entries.forEach(([name, value]) => {
      copy.delete(name);
      if (!value || !value.length) return; // skip empty
      if (Array.isArray(value)) {
        if (joinArrays) copy.append(name, value.join(","))
        else value.forEach(val => copy.append(name, val))
      }
      else {
        copy.append(name, value)
      }
    })
    return copy;
  },
  toString(this: IURLSearchParams, params: ISearchParamsToStringOptions = {}) {
    const { encoder = this.uriParamDefaultEncoder, withPrefix = false } = params;
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

export function createExtendedSearchParams(search: string | URLSearchParams, onChange?: (newValue: string) => void) {
  let searchParams = new URLSearchParams(search) as IURLSearchParams;
  Object.assign(searchParams, searchParamsExtras);
  if (!onChange) {
    return searchParams;
  }
  return new Proxy(searchParams, {
    get(target, prop: string | symbol | any, context: any) {
      let keyRef = Reflect.get(target, prop, context);
      if (typeof keyRef === "function") {
        return (...args: any[]) => {
          let oldValue = target.toString({ encoder: searchParams.uriParamDefaultEncoder });
          let result = Reflect.apply(keyRef, target, args);
          let newValue = target.toString({ encoder: searchParams.uriParamDefaultEncoder })
          if (oldValue !== target.toString()) onChange(newValue)
          return result
        };
      }
      return keyRef;
    }
  })
}

function normalize(urlChunk: string, prefix = "?") {
  urlChunk = String(urlChunk).trim()
  if (!urlChunk || urlChunk == prefix) return ""
  if (urlChunk.startsWith(prefix)) return urlChunk
  return prefix + urlChunk
}

export default createObservableHistory;
