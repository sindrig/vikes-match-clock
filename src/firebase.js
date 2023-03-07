import "./index.css";
import firebase from "firebase/compat/app";
import "firebase/compat/database";
import "firebase/compat/auth";
import "firebase/compat/storage";

const fbConfig = {
  apiKey: "AIzaSyDhdG6cVA2xTfHhceCUA6N4I1EgdDIL1oA",
  authDomain: "vikes-match-clock-firebase.firebaseapp.com",
  databaseURL: "https://vikes-match-clock-firebase.firebaseio.com",
  storageBucket: "gs://vikes-match-clock-firebase.appspot.com",
};

if (process.env.NODE_ENV !== "production") {
  console.warn("Using development firebase, be advised");
  fbConfig.apiKey = "AIzaSyCX-4CXktMfJL47nrrpc1y8Q73j09ItmQI";
  fbConfig.authDomain = "vikes-match-clock-staging.firebaseapp.com";
  fbConfig.databaseURL = "https://vikes-match-clock-staging.firebaseio.com";
  fbConfig.storageBucket = "gs://vikes-match-clock-staging.appspot.com";
}

firebase.initializeApp(fbConfig);

const storage = firebase.storage();

export { storage, firebase };
