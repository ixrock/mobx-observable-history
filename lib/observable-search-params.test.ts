import { comparer, configure, isObservable, reaction } from "mobx"
import { createMemoryHistory, Location } from "history";
import { createObservableHistory, ObservableHistory } from "./observable-history";
import { ObservableSearchParams } from "./observable-search-params";

configure({
  // allow to update location.* without wrapping with @action/runInAction()
  enforceActions: "never",
});

let history: ObservableHistory;
let currentLocation: Location;

beforeEach(() => {
  history = createObservableHistory(createMemoryHistory(), {
    searchParams: {
      skipEmpty: true,
      joinArrays: true,
      joinArraysWith: "-",
    }
  });
  history.listen((location) => currentLocation = location)
})

describe("history.searchParams is observable URLSearchParams() with extra goodies", () => {
  test("is instanceof URLSearchParams", function () {
    expect(history.searchParams).toBeInstanceOf(URLSearchParams);
  })

  test('history.searchParams is observable', () => {
    expect(isObservable(history.searchParams));
  })

  test("in sync with history.location.search", () => {
    const location = `?x=${Math.random()}`;
    history.replace(location);
    expect(currentLocation.search).toBe(location)
    expect(history.location.search).toBe(location)
    expect(history.searchParams.toString()).toBe(location.replace("?", ""))
  })

  describe("history.searchParams.replace(search)", () => {
    test('fully replaces search string representation', () => {
      const x = Math.random().toString();

      history.replace(`/?x=${x}`);
      expect(history.searchParams.get("x")).toBe(x);
      history.searchParams.replace(`y=1`) // replace with string-params
      expect(history.searchParams.toString()).toBe(`y=1`);
      history.searchParams.replace({ y: "2" }) // replace with params as plain object
      expect(history.location.search).toBe(`?y=2`);
    })
  })

  describe("history.searchParams.merge(search)", () => {
    test('merges search-params with existing', () => {
      const x = Math.random().toString();
      history.replace(`/?x=${x}`);

      expect(history.searchParams.get("x")).toBe(x);
      history.searchParams.merge(`y=1`) // string
      expect(history.location.search).toBe(`?x=${x}&y=1`);
      history.searchParams.merge({ z: "2" }) // object
      expect(history.location.search).toBe(`?x=${x}&y=1&z=2`);
    })
  })

  describe("history.searchParams.deleteAll()", () => {
    test('clears existing search params', () => {
      history.replace("?x=123");
      expect(history.searchParams.toString()).toBe("x=123");
      history.searchParams.deleteAll()
      expect(history.searchParams.toString()).toBe("");
      expect(history.location.search).toBe("");
    })
  })

  describe("history.searchParams.normalize(search)", () => {
    test('normalize search params with current options', () => {
      let searchParams = new ObservableSearchParams("?x=1&y=&z=3&x=2", {
        skipEmpty: true,
        joinArrays: true,
        joinArraysWith: "-",
      });
      expect(searchParams.toString()).toBe("x=1-2&z=3");
    })
  })

  describe("history.searchParams.getAll(param: string)", () => {
    test('is observable', () => {
      history.replace("/");
      let xValues: string[] = [];

      reaction(() => history.searchParams.getAll("x"), values => xValues = values, {
        equals: comparer.shallow,
      });

      history.replace({ search: "x=1-2&x=3" });
      expect(xValues).toEqual(["1", "2", "3"]);

      history.searchParams.set("x", "4")
      expect(xValues).toEqual(["4"]);

      history.searchParams.set("y", "2")
      history.searchParams.append("y", "3")
      expect(history.searchParams.toString()).toEqual("x=4&y=2-3");
    });

    test('respects opts.joinArrays == true', () => {
      let searchParams = new ObservableSearchParams("?x=1&&&z=3&x=2", {
        joinArrays: true,
        joinArraysWith: "~",
      });
      const copy = new URLSearchParams("x=1~2&z=3").toString();
      expect(searchParams.toString()).toBe(copy.toString());
      expect(searchParams.getAll("x")).toEqual(["1", "2"]);
    })
  })

  describe("history.searchParams.toString({withPrefix?})", () => {
    test("is observable", () => {
      let searchString: string;
      reaction(() => history.searchParams.toString(), s => searchString = `?${s}`);
      history.location.search = "?x=1&y=2"
      expect(searchString).toBe(history.location.search);
    })

    test('{withPrefix:true} adds prefix `?` to output string', () => {
      history.replace(`?data=${Math.random()}`);
      expect(history.searchParams.toString()).toBe(currentLocation.search.replace("?", ""));
      expect(history.searchParams.toString({ withPrefix: true })).toBe(currentLocation.search);
    })
  })
})
