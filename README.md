## MobX & History.js make some ♡

_History.js wrapper with observable location and reactive URLSearchParams_

## Install
- NPM `npm i mobx-observable-history`
- Yarn `yarn add mobx-observable-history`

## Why
When work on projects with great [mobx](https://github.com/mobxjs/mobx) it feels natural 
to use reactivity everywhere.

## Benefits
- convenient api to manage current location state  
- observable `history.location` and `history.action`
- observable `history.searchParams` which is [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/URLSearchParams) object with some extras
- modifying `history.location` prevents redundant transitions to same location (e.g. double clicks)
- compatible with [react-router](https://reacttraining.com/react-router/web/guides/quick-start)

## Examples

```js
import { autorun, reaction, comparer } from "mobx"
import { createBrowserHistory } from "history";
import { createObservableHistory } from "mobx-observable-history"

const browserHistory = createBrowserHistory();
const navigation = createObservableHistory(browserHistory);

// Reacting to any location change
autorun(() => {
  const {pathname, search, hash} = navigation.location
  console.log("LOCATION", {pathname, search, hash})
})

// Reacting to partial location change
reaction(() => navigation.location.pathname, path => {
  console.log("PATH", path)
})

// Reacting to single search param, e.g. ?x=
reaction(() => navigation.searchParams.get("x"), x => {
  console.log("X", x) // x == ""
})
navigation.searchParams.delete("x") // x == null

// Reacting to multiple values of one search param, e.g. ?y=1&y=2
reaction(() => navigation.searchParams.getAll("y"), params => {
  console.log("Y", params) // params is ["1", "2"]
}, {
  fireImmediately: true,
  equals: comparer.shallow
})

// Partial location updates
navigation.location.pathname = "/path"  // push history to new location, same as navigation.merge("/path")
navigation.location.search = "?x=1" // `?` can be omitted
navigation.location.hash = "#y" // `#` can be omitted
navigation.merge({pathname: "/path", search: "z=3"}) // push history to new location 
navigation.merge("/path?search=text", true); // replace history with merged location  
```

## API
- Get observable current location string (pathname + search + hash)
```ts
history.getPath(): string
```

- Merging current location.
```ts
history.merge(location: string | object, replace?: boolean): void
```

- Destroy and return underlying history.js object.
```ts
history.destroy(): History
```

- Standard URLSearchParams object with following extra goodies:
```ts
history.searchParams
```

- Parse first search param from `searchParams.get(name)` as array. 
```ts
history.searchParams.getAsArray(name: string, splitter = ","): string[]
```

- Partial updates of current search params.
```ts
history.searchParams.merge(params: object, options?: { joinArrays?: true joinArraysWith?: "," skipEmptyValues?: true })
```

- Creates copy of search-params. Usable for building query strings based on current location.
```ts
history.searchParams.copyWith(params: object, options?: { joinArrays?: true joinArraysWith?: "," skipEmptyValues?: true })
````

- Patched version of standard `searchParams.toString()`
```ts
history.searchParams.toString(options?: { withPrefix?: boolean; encoder?: (val: string) => string })
```

## License
MIT