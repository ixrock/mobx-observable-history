import { intercept, observable, reaction, transaction } from "mobx";
import { createBrowserHistory, createLocation, createPath, History, Location, LocationDescriptor, locationsAreEqual, UnregisterCallback } from "history";

export interface ObservableHistory<S = any> extends History<S> {
  searchParams: URLSearchParamsExtended;
  getPath(): string;
  merge(location: LocationDescriptor<S>, replace?: boolean): void;
  destroy(): History<S>;
}

export interface URLSearchParamsExtended extends URLSearchParams {
  toggle(param: string, value?: string): void
  toString(): string;
}

export function createObservableHistory<S>(history = createBrowserHistory<S>()): ObservableHistory<S> {
  const disposers: UnregisterCallback[] = []

  const data = observable({
    action: history.action,
    location: observable.object(history.location, {
      state: observable.struct
    }),
    searchParams: createSearchParams(history.location.search, syncSearchParams)
  });

  function syncSearchParams(search: string) {
    if (data.location.search !== normalize(data.searchParams.toString())) {
      data.location.search = search
      data.searchParams = createSearchParams(search, syncSearchParams);
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
      value(this: ObservableHistory<S>) {
        disposers.forEach(dispose => dispose())
        delete this.location;
        delete this.action;
        delete this.searchParams;
        return Object.getPrototypeOf(this)
      }
    }
  })
}

const mutableSearchMethods = ["set", "delete", "append", "sort", "toggle"];

function createSearchParams(search: string, onChange: (newValue: string) => void) {
  let searchParams = new URLSearchParams(search);
  let extendedParams: URLSearchParamsExtended = Object.assign(searchParams, {
    toggle(this: URLSearchParams, name: string, value: string) {
      if (value) this.set(name, value)
      else this.delete(name)
    }
  })
  return new Proxy(extendedParams, {
    get(target, prop: string | symbol | any, context: any) {
      let keyRef = Reflect.get(target, prop, context);
      if (typeof keyRef === "function") {
        return (...args: any[]) => {
          let oldValue = target.toString();
          let result = Reflect.apply(keyRef, target, args);
          let isMutableOperation = mutableSearchMethods.includes(prop);
          if (isMutableOperation) {
            let newValue = target.toString();
            if (oldValue !== newValue) onChange(newValue)
          }
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