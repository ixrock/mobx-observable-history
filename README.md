## MobX & History.js make some ♡

_History.js wrapper with observable location and reactive URLSearchParams_

## Install
- NPM `npm i mobx-observable-history`
- Yarn `yarn add mobx-observable-history`

## Dependencies:
- `mobx: "^6.0"`
- `history: "^4.0"`

## Why
When work on projects [mobx](https://github.com/mobxjs/mobx) it feels natural 
to use reactivity everywhere.

## Benefits
- convenient api to manage current location's state  
- observable `history.location` and `history.action`
- observable `history.searchParams` is [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/URLSearchParams) object with extra goodies (see below)
- compatible with [react-router](https://reacttraining.com/react-router/web/guides/quick-start)

## Examples

```javascript
import { autorun, reaction, comparer } from "mobx"
import { createBrowserHistory } from "history";
import { createObservableHistory } from "mobx-observable-history"

const history = createBrowserHistory();
const navigation = createObservableHistory(history);

// Reacting to any location change
autorun(() => {
  const {pathname, search, hash} = navigation.location
  console.log("LOCATION", {pathname, search, hash})
})

// Reacting to partial location change
reaction(() => navigation.location.pathname, page => {
  console.log("PAGE", page)
})

// Reacting to multiple values of one search param, e.g. ?y=1&y=2
reaction(() => navigation.searchParams.getAll("y"), params => {
  console.log("Y", params) // params is ["1", "2"]
}, {
  fireImmediately: true,
  equals: comparer.shallow,
})

// Partial updates
navigation.location.pathname = "/path"  // push history to new location, same as navigation.merge("/path")
navigation.location.search = "?x=1" // `?` can be omitted
navigation.location.hash = "#y" // `#` can be omitted
navigation.merge({pathname: "/path", search: "z=3"}) // push history to new location 
navigation.searchParams.delete("x") // remove all ?x=1&x=.. from search params
navigation.searchParams.set("y", "2") // remove previous all ?y=1&y=2&y=etc. and set to single value
```

## API

### history.toString(): string
Get observable location (pathname + search + hash)

Examples:
```javascript
autorun(() => console.log("LOCATION", history.toString()))
```

### history.merge(location: object | Partial<Location>, replace?: boolean): void
Merge partial location (pathname, search, hash)

Examples:
```javascript
history.merge({pathname: "/test"})       // history.push + merge
history.merge("/test?x=1&x2#tag")
history.merge({pathname: "/test"}, true) // history.replace + merge
```

### history.normalize(location: string | LocationDescriptor, opts?: { skipEmpty = false }): string
Normalize location and return new object `{pathname, search, hash}`

### history.destroy(): History
Stops internal observations and return native history.js object

## history.searchParams is observable URLSearchParams() with extra goodies:

- ### history.searchParams.merge(search: string | object | URLSearchParams)
  Merge new search params with existing. 

- ### history.searchParams.replace(search: string | object | URLSearchParams)
  Fully replace current search params.

- ### history.searchParams.deleteAll()
  Clear all current search params.

- ### history.searchParams.toString(opts?: { withPrefix = false })
  Observable search-params string representation. 
    - `{withPrefix: true}` adds `?` prefix to output (default: false)

## License
MIT
