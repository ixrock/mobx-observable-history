import { intercept, observable, reaction } from "mobx";
import { createBrowserHistory, createLocation, createPath, History, Location, LocationDescriptor, parsePath, UnregisterCallback } from "history";

export interface ObservableHistory<S = any> extends History<S> {
  searchParams: URLSearchParams & { toString(): string };
  merge(location: LocationDescriptor<S>, replace?: boolean): void;
  destroy(): History<S>;
}

export function createObservableHistory<S>(history = createBrowserHistory<S>()): ObservableHistory<S> {
  const disposers: UnregisterCallback[] = [];
  const mutableQueryMethods = ["set", "sort", "delete", "append"];

  const data = observable({
    action: history.action,
    location: getLocation(),
    searchParams: getSearchParams(),
  });

  function normalize(urlChunk: string, prefix = "?") {
    urlChunk = urlChunk.trim();
    if (!urlChunk || urlChunk == prefix) return ""
    if (urlChunk.startsWith(prefix)) return urlChunk
    return prefix + urlChunk
  }

  function getLocation(location = history.location): Location<S> {
    const observableLocation = observable.object({ state: null, ...location }, {
      state: observable.struct
    });
    intercept(observableLocation, change => {
      let { name, object } = change;
      if (!(name in object)) {
        return null; // don't allow create new props on location object
      }
      if (change.type === "update") {
        switch (name) {
          case "search":
            change.newValue = normalize(change.newValue, "?")
            break;
          case "hash":
            change.newValue = normalize(change.newValue, "#")
            break;
        }
      }
      return change
    })
    return observableLocation;
  }

  function setSearchParams(search: string): void {
    search = normalize(search);
    let dataSearch = data.location.search;
    let searchParams = normalize(data.searchParams.toString());
    if (dataSearch !== searchParams) {
      data.location.search = search
      data.searchParams = getSearchParams(search);
    }
  }

  function getSearchParams(search = history.location.search) {
    let searchParams = new URLSearchParams(search);
    return new Proxy(searchParams, {
      get(target, prop: string | symbol | any, context: any) {
        let keyRef = Reflect.get(target, prop, context);
        if (typeof keyRef === "function") {
          return (...args: any[]) => {
            let oldValue = target.toString();
            let result = Reflect.apply(keyRef, target, args);
            let isMutableOperation = mutableQueryMethods.includes(prop);
            if (isMutableOperation) {
              let newValue = target.toString();
              if (oldValue !== newValue) setSearchParams(newValue);
            }
            return result
          };
        }
        return keyRef;
      }
    })
  }

  disposers.push(
    intercept(data, "location", location => {
      if (typeof location.newValue === "string") {
        location.newValue = parsePath(location.newValue)
      }
      let oldPath = createPath(data.location)
      let newPath = createPath(location.newValue)
      if (oldPath === newPath) {
        return null; // skip update
      }
      location.newValue = getLocation(location.newValue)
      return location;
    }),

    // update search-params object
    reaction(() => data.location.search, setSearchParams),

    // update url when history.location modified directly
    reaction(() => createPath(data.location), path => {
      let historyPath = createPath(history.location);
      if (historyPath !== path) {
        history.push(createLocation(path))
      }
    }),

    // update observables from history change event
    history.listen((location, action) => {
      data.action = action
      data.location = location
    })
  );

  return Object.create(history, {
    action: {
      configurable: true,
      get() {
        return data.action
      }
    },
    location: {
      configurable: true,
      get() {
        return data.location
      },
      set(val: string | Location<S> | any) {
        data.location = val
      }
    },
    searchParams: {
      configurable: true,
      set: setSearchParams,
      get() {
        return data.searchParams
      },
    },
    merge: {
      value(location: LocationDescriptor<S>, replace = false) {
        if (typeof location === "string") {
          location = createLocation(location);
          Object.entries(location).forEach(([param, value]) => {
            // @ts-ignore
            if (!value) delete location[param];
          })
        }
        let newLocation = { ...data.location, ...location };
        if (replace) history.replace(newLocation);
        else history.push(newLocation)
      }
    },
    destroy: {
      value(this: ObservableHistory<S>) {
        delete this.location;
        delete this.action;
        delete this.searchParams;
        disposers.forEach(dispose => dispose())
        return Object.getPrototypeOf(this)
      }
    }
  })
}
