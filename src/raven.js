class Raven {
  constructor() {
    this.registered = false;
    if (process.env.NODE_ENV === "production") {
      if (window.Raven) {
        window.Raven.config(
          "https://cb9ee6811f634cfb83e9615c9f3f9d4a@sentry.io/1214011",
          {
            release: "0-0-0",
            environment: "production",
          },
        ).install();
        console.log("Raven registered");
        this.registered = true;
      } else {
        console.log("Was going to register Raven, but could not find it");
      }
    } else {
      console.log(`${process.env.NODE_ENV} does not use Raven`);
    }
  }

  captureMessage(message) {
    if (this.registered) {
      window.Raven.captureMessage(JSON.stringify(message));
    } else {
      console.log("Raven not configured, not capturing message");
    }
  }
}

export default new Raven();
