## MobX & History.js make some ♡

_History.js wrapper with observable location and reactive URLSearchParams_

## Install
- NPM `npm i mobx-observable-history`
- Yarn `yarn add mobx-observable-history`

## Why
When work on projects [mobx](https://github.com/mobxjs/mobx) it feels natural 
to use reactivity everywhere.

## Benefits
- convenient api to manage current location's state  
- observable `history.location` and `history.action`
- observable `history.searchParams` which is [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/URLSearchParams) object with some extras
- compatible with [react-router](https://reacttraining.com/react-router/web/guides/quick-start)

## Examples

```javascript
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
reaction(() => navigation.location.pathname, page => {
  console.log("PAGE", page)
})

// Reacting to multiple values of one search param, e.g. ?y=1&y=2
reaction(() => navigation.searchParams.getAll("y"), params => {
  console.log("Y", params) // params is ["1", "2"]
}, {
  fireImmediately: true,
  equals: comparer.shallow
})

// Partial updates
navigation.location.pathname = "/path"  // push history to new location, same as navigation.merge("/path")
navigation.location.search = "?x=1" // `?` can be omitted
navigation.location.hash = "#y" // `#` can be omitted
navigation.merge({pathname: "/path", search: "z=3"}) // push history to new location 
navigation.merge("/path?search=text", true); // replace history with merged location  
navigation.searchParams.delete("x") // remove all ?x=1&x=.. from search params
navigation.searchParams.set("y", "2") // remove previous all ?y=1&y=2&y=etc. and set to single value
```

## API

### history.getPath(): string
Get observable current location string (pathname + search + hash)

Examples:
```javascript
autorun(() => console.log("PATH", history.getPath()))
```

### history.merge(location: string | object, replace?: boolean): void
Merging current location (pathname and/or search-params and/or hash)

Examples:
```javascript
history.merge({pathname: "/test"})       // history.push + merge
history.merge("/test?x=1&x2#tag")
history.merge({pathname: "/test"}, true) // history.replace + merge
```

### history.destroy(): History
Destroy and return underlying history.js object.

### history.searchParams
Standard URLSearchParams object with following extra goodies:

- ### searchParams.getAsArray(name: string, splitter = ","): string[]
    Parse first search param from `searchParams.get(name)` as array. 
    
    Examples:
    ```javascript
    history.location.search = "?x=1-2-3"
    history.searchParams.getAsArray("x", "-") // ["1","2","3"]
    history.location.search = "?x="+ [4,5].join(",")
    history.searchParams.getAsArray("x") // ["4","5"]
    ```

- ### searchParams.merge(params: object, options?: { joinArrays?, joinArraysWith?, skipEmptyValues? })
    Partial updates of current search params. Second optional argument `options` has 3 params:
    - `joinArrays` join array values of single param, `merge({x: [1,2]}) => x=1,2` (default: true)
    - `joinArraysWith` (default: ",") 
    - `skipEmptyValues` skip empty values (null, undefined, '') and don't add empty params like `&x=` (default: true)
    
    Examples:
    ```javascript
    history.location.search = "x=1&x=2&y=3&z=4"
    history.searchParams.merge({z: ["a", "b", "c"], x: null}) // y=3&z=a,b,c  
    history.searchParams.merge({z: ["a", "b", "c"], x: null}, {joinArrays: false}) // y=3&z=a&z=b&z=c  
    history.searchParams.merge({x: ""}, {skipEmptyValues: false}) // y=3&z=4&x=
    ```

- ### searchParams.copyWith(params: object, options?: { joinArrays?, joinArraysWith?, skipEmptyValues? })
    Creates copy of search-params. Usable for building query strings based on current location.
    Second argument `options` has same definition as in `merge()` above since it uses `copyWith()` under the hood.
    
    Examples:
    ```javascript
    history.location.search = `?namespace=default&context=other`
    history.searchParams.copyWith({namespace: "other"}).toString()
    ```

- ### searchParams.toString(options?: { withPrefix?, encoder? })
    Modified version of standard `toString()` with possibility to customize output:
    - `withPrefix` adds `?` prefix to string output (default: false)
    - `encoder` function to encode param values (default: `window.encodeURI`) 

    Examples:
    ```javascript
    history.searchParams.search = `?x=1&context=/test`
    history.searchParams.toString({withPrefix: true}) // ?x=1&context=/test 
    history.searchParams.toString({encoder: encodeURIComponent}) // x=1&context=%2Ftest 
    ```

## License
MIT
