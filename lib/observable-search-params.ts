import { action, makeObservable, observable } from "mobx";

export interface ObservableSearchParams extends URLSearchParams {
}

export interface ObservableSearchParamsOptions {
  skipEmpty?: boolean // skip params without meaningful value, e.g. "y" in "?x=1&y="
  joinArrays?: boolean; // default: true, joining params with same name, e.g. "x=1&x=2" becomes "x=1,2"
  joinArraysWith?: string; // default: ","
}

export class ObservableSearchParams {
  @observable protected search: string = "";
  @observable.ref protected searchParams: URLSearchParams;

  constructor(init?: string | Record<string, string> | URLSearchParams, protected opts: ObservableSearchParamsOptions = {}) {
    makeObservable(this);

    this.opts = { skipEmpty: true, joinArrays: false, joinArraysWith: ",", ...opts };
    this.search = this.normalize(init);
    this.searchParams = new URLSearchParams(init);

    return new Proxy(this, {
      getPrototypeOf(target: ObservableSearchParams) {
        return URLSearchParams.prototype;
      },
      get: (target, prop: string | symbol, context: any) => {
        let fieldRef = Reflect.get(target, prop, context);

        // handle native URLSearchParams()-api updates via proxy-object
        if (!(prop in target)) {
          fieldRef = Reflect.get(this.searchParams, prop, context);

          if (typeof fieldRef === "function") {
            return (...args: any[]) => {
              let oldValue = this.searchParams.toString();
              let result = Reflect.apply(fieldRef, this.searchParams, args);
              let newValue = this.searchParams.toString();
              let isChanged = oldValue !== newValue;
              if (isChanged) {
                this.replace(newValue);
              }
              return result;
            };
          }
        }

        return fieldRef;
      },
    })
  }

  normalize(search: string | Record<string, any> | URLSearchParams = ""): string {
    const { joinArrays, joinArraysWith, skipEmpty } = this.opts;
    const params: Record<string, string[]> = {};
    const normalizedParams: [name: string, value: string][] = [];

    Array.from(new URLSearchParams(search)).forEach(([param, value]) => {
      if (skipEmpty && !value) return;
      const values: string[] = joinArraysWith ? value.split(joinArraysWith) : [value];
      params[param] ??= [];
      params[param].push(...values);
    });

    Object.entries(params).forEach(([name, values]) => {
      if (joinArrays) {
        normalizedParams.push([name, values.join(joinArraysWith)]);
      } else {
        const multiParamsWithSameKey = values.map(value => [name, value]) as [string, string][];
        normalizedParams.push(...multiParamsWithSameKey);
      }
    });

    return new URLSearchParams(normalizedParams).toString();
  }

  @action
  replace(search: string | Record<string, any> | URLSearchParams) {
    search = this.normalize(search);

    if (this.search !== search) {
      this.search = search;
      this.searchParams = new URLSearchParams(search);
    }
  }

  merge(search: string | Record<string, any> | URLSearchParams) {
    search = this.normalize(search);
    this.replace(`${this.search}&${search}`);
  }

  @action
  deleteAll() {
    this.search = "";
    Array.from(this.searchParams.keys()).forEach(key => {
      this.searchParams.delete(key);
    });
  }

  getAll(param: string): string[] {
    const values: string[] = this.searchParams.getAll(param);
    const { joinArrays, joinArraysWith } = this.opts

    if (joinArrays) {
      return values.flatMap(param => param.split(joinArraysWith));
    }
    return values;
  }

  toString({ withPrefix = false } = {}): string {
    if (!this.search) return "";
    return `${withPrefix ? "?" : ""}${this.search}`;
  }
}
