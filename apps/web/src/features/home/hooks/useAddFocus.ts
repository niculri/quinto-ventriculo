// After a course is taken out of «Tus ramos», the focus goes to «Agregar un ramo», as soon as it is enabled.

import { useEffect, useRef, useState } from 'react';

export function useAddFocus(addable: number) {
  const addBoxRef = useRef<HTMLDivElement>(null);
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus) return;
    const button = addBoxRef.current?.querySelector('button');
    if (button && !button.disabled) {
      button.focus();
      setRefocus(false);
    }
  }, [refocus, addable]);
  return { addBox: addBoxRef, refocus: () => setRefocus(true) };
}
