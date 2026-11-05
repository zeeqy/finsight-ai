import { createContext, useContext } from 'react';

const NavContext = createContext(() => {});

export const NavProvider = NavContext.Provider;

/** `const goTo = useGoTo(); goTo('advisor')` opens another module. */
export const useGoTo = () => useContext(NavContext);
