import { intercept, observable, reaction, transaction } from "mobx";
import { createBrowserHistory, createLocation, createPath, History, Location, LocationDescriptor, UnregisterCallback } from "history";

export interface ObservableHistory<S = any> extends History<S> {
  searchParams: URLSearchParams & { toString(): string };
  merge(location: LocationDescriptor<S>, replace?: boolean): void;
  destroy(): History<S>;
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

  function setLocation(newLocation: string | Location<S>) {
    if (typeof newLocation === "string") {
      newLocation = createLocation(newLocation)
    }
    let oldPath = createPath(data.location)
    let newPath = createPath(newLocation)
    if (oldPath !== newPath) {
      transaction(() => {
        Object.assign(data.location, newLocation)
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
      let { name, object } = change;
      if (!(name in object)) {
        return null; // don't allow create new props
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

function createSearchParams(search: string, onChange: (newValue: string) => void) {
  let searchParams = new URLSearchParams(search);
  return new Proxy(searchParams, {
    get(target, prop: string | symbol | any, context: any) {
      let keyRef = Reflect.get(target, prop, context);
      if (typeof keyRef === "function") {
        return (...args: any[]) => {
          let oldValue = target.toString();
          let result = Reflect.apply(keyRef, target, args);
          let isMutableOperation = ["set", "sort", "delete", "append"].includes(prop);
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
