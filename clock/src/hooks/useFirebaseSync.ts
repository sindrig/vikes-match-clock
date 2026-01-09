import { useEffect, useRef, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { firebaseDatabase } from "../firebaseDatabase";
import { RootState, Match, ControllerState, ViewState } from "../types";
import { RemoteActionType } from "../ActionTypes";



export function useFirebaseSync() {
  const dispatch = useDispatch();
  const { sync, listenPrefix } = useSelector((state: RootState) => state.remote);
  const { isLoaded, isEmpty } = useSelector((state: RootState) => state.auth);
  const match = useSelector((state: RootState) => state.match);
  const controller = useSelector((state: RootState) => state.controller);
  const view = useSelector((state: RootState) => state.view);

  const isAuthenticated = isLoaded && !isEmpty;
  const prevMatchRef = useRef<Match | null>(null);
  const prevControllerRef = useRef<ControllerState | null>(null);
  const prevViewRef = useRef<ViewState | null>(null);
  const isInitializedRef = useRef(false);

  const syncToFirebase = useCallback(
    async (stateType: "match" | "controller" | "view", data: unknown) => {
      if (!sync || !isAuthenticated || !listenPrefix) return;
      try {
        await firebaseDatabase.syncState(listenPrefix, stateType, data);
      } catch (error) {
        console.error(`Failed to sync ${stateType} to Firebase:`, error);
      }
    },
    [sync, isAuthenticated, listenPrefix],
  );

  useEffect(() => {
    if (!sync || !isAuthenticated || !listenPrefix) return;
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      prevMatchRef.current = match;
      prevControllerRef.current = controller;
      prevViewRef.current = view;
      return;
    }

    if (prevMatchRef.current !== match) {
      prevMatchRef.current = match;
      void syncToFirebase("match", match);
    }
  }, [match, sync, isAuthenticated, listenPrefix, syncToFirebase]);

  useEffect(() => {
    if (!sync || !isAuthenticated || !listenPrefix) return;
    if (!isInitializedRef.current) return;

    if (prevControllerRef.current !== controller) {
      prevControllerRef.current = controller;
      void syncToFirebase("controller", controller);
    }
  }, [controller, sync, isAuthenticated, listenPrefix, syncToFirebase]);

  useEffect(() => {
    if (!sync || !isAuthenticated || !listenPrefix) return;
    if (!isInitializedRef.current) return;

    if (prevViewRef.current !== view) {
      prevViewRef.current = view;
      void syncToFirebase("view", view);
    }
  }, [view, sync, isAuthenticated, listenPrefix, syncToFirebase]);

  useEffect(() => {
    if (!sync || !listenPrefix) return;

    const paths = [
      { path: `states/${listenPrefix}/match`, storeAs: "match" },
      { path: `states/${listenPrefix}/controller`, storeAs: "controller" },
      { path: `states/${listenPrefix}/view`, storeAs: "view" },
    ];

    const unsubscribes: (() => void)[] = [];

    paths.forEach(({ path, storeAs }) => {
      const dbRef = ref(database, path);
      const unsubscribe = onValue(
        dbRef,
        (snapshot) => {
          const data = snapshot.val();
          if (data !== null) {
            dispatch({
              type: RemoteActionType.RECEIVE_REMOTE_DATA,
              storeAs,
              data,
            });
          }
        },
        (error) => {
          console.error(`Firebase listener error for ${path}:`, error);
        },
      );
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [sync, listenPrefix, dispatch]);

  useEffect(() => {
    const locationsRef = ref(database, "locations");
    const unsubscribe = onValue(locationsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        dispatch({
          type: RemoteActionType.RECEIVE_REMOTE_DATA,
          storeAs: "locations",
          data,
        });
      }
    });

    return () => unsubscribe();
  }, [dispatch]);
}

export function useFirebaseAuthListener() {
  const dispatch = useDispatch();
  const { uid } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    if (!uid) return;

    const authRef = ref(database, `auth/${uid}`);
    const unsubscribe = onValue(authRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        dispatch({
          type: RemoteActionType.RECEIVE_REMOTE_DATA,
          storeAs: "authData",
          data,
        });
      }
    });

    return () => unsubscribe();
  }, [uid, dispatch]);
}
