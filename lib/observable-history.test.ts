import { configure, isObservable, reaction } from "mobx"
import { createBrowserHistory, createPath, History, Location } from "history";
import { createObservableHistory, ObservableHistory } from "./observable-history";

configure({
  // allow to update location.* without wrapping with @action/runInAction()
  enforceActions: "never",
});

let history: History
let navigation: ObservableHistory
let currentLocation: Location

beforeEach(() => {
  history = createBrowserHistory()
  navigation = createObservableHistory(history)
  navigation.listen((location) => currentLocation = location)

  jest.spyOn(navigation, "goBack").mockImplementation(async () => {
    history.goBack();
    await new Promise(resolve => setTimeout(resolve, 25)); // wait for "popstate" event
  });
})

describe("history.action", () => {
  test("is observable getter", async () => {
    history.push(getRandomLocation());
    expect(navigation.action).toBe("PUSH");

    await navigation.goBack();
    expect(navigation.action).toBe("POP");

    await navigation.goForward();
    expect(navigation.action).toBe("POP");

    history.replace(getRandomLocation());
    expect(navigation.action).toBe("REPLACE");
  })
})

describe("history.location", () => {
  test("is observable", () => {
    expect(isObservable(navigation.location)).toBeTruthy();
  })

  test("partial update with same history.location doesn't trigger reaction", () => {
    let reactionTimes = 0;
    let newLocation = getRandomLocation();
    reaction(() => createPath(navigation.location), () => reactionTimes++)

    navigation.location = newLocation;
    navigation.location.pathname = newLocation.pathname
    navigation.location.search = newLocation.search
    navigation.location.hash = newLocation.hash
    navigation.push({ ...newLocation })
    expect(reactionTimes).toBe(1);
  })

  test("updating history.location.search skips `?` when empty", () => {
    navigation.replace("/?")
    expect(currentLocation.search).toBe("")
    navigation.location.search = "?"
    expect(currentLocation.search).toBe("")
    navigation.location.search = "test"
    expect(currentLocation.search).toBe("?test")
  })

  test("updating history.location.hash skips `#` when empty", () => {
    navigation.replace("/#")
    expect(currentLocation.hash).toBe("")
    navigation.location.hash = "#"
    expect(currentLocation.hash).toBe("")
    navigation.location.hash = "test"
    expect(currentLocation.hash).toBe("#test")
  })
})

describe("history.merge(location, replace = false)", () => {
  test("partially updates location like direct access to history.location", () => {
    let location1 = getRandomLocation()
    let location2 = getRandomLocation()
    history.replace(location1)

    navigation.merge({ pathname: location2.pathname });
    expect(currentLocation).toMatchObject({
      ...location1,
      pathname: location2.pathname
    })

    navigation.merge({ search: location2.search });
    expect(currentLocation).toMatchObject({
      ...location1,
      pathname: location2.pathname,
      search: location2.search,
    })

    navigation.merge(location2);
    expect(currentLocation).toMatchObject(location2)
  })
})

//-- Utils

function getRandomLocation<S>() {
  function generateId() {
    return Math.random().toString(16).substr(2, 5);
  }

  return {
    pathname: `/path=${generateId()}`,
    search: `?search=${generateId()}`,
    hash: `#hash=${generateId()}`,
  } as Location<S>;
}
