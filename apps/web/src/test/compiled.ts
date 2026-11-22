// Whether the tests run the compiled code: the coverage run measures the source without the React Compiler, so what
// only the compiler gives (a value kept between renders) is looked at only when it is on.
import { renderHook } from '@testing-library/react';
import { useState } from 'react';

// A compiled hook keeps its result between renders with the same argument; one that is not compiled makes a new one in
// each render. (The compiler only takes a hook that calls another one.)
function useProbe(value: number) {
  useState(0);
  return { value };
}

export const compiled = (() => {
  const { result, rerender, unmount } = renderHook(useProbe, { initialProps: 1 });
  const first = result.current;
  rerender(1);
  const kept = result.current === first;
  unmount();
  return kept;
})();
