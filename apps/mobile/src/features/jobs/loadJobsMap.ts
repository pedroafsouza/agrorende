/** Loads the native map on demand so the list view never pulls react-native-maps in. */
export const loadJobsMap = () => import("./JobsMap");
