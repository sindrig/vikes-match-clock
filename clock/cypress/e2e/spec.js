const ONE_MINUTE = 60000;
const SECOND = 1000;

context("Basic navigation", () => {
  beforeEach(() => {
    // usually we recommend setting baseUrl in cypress.json
    // but for simplicity of this example we just use it here
    // https://on.cypress.io/visit
    cy.clearLocalStorage();
    // Need to start at 1 because 0 won't trigger started
    cy.clock(new Date(2025, 3, 10, 12, 0, 0).getTime());
    cy.visit("/");
  });

  it("starts the clock and does some things", () => {
    cy.contains("Stillingar").click();
    cy.get(".match-start-time-selector").type("12:30");
    cy.get("#view-selector-match").click();
    cy.contains("Heim").click();
    cy.contains("Hefja niðurtalningu").should("have.length", 1);
    cy.contains("Byrja").click();
    cy.contains("Hefja niðurtalningu").should("have.length", 0);
    cy.tick(ONE_MINUTE / 2);
    cy.contains("Pása").should("have.length", 1);
    cy.tick(ONE_MINUTE);
    cy.get(".matchclock").should("have.text", "01:30");
    cy.contains("Stillingar").click();
    cy.get("#team-selector-awayTeam").type("fram");
    cy.tick(ONE_MINUTE * 10);
    cy.get(".matchclock").should("have.text", "11:30");
    cy.get(".away img").should("have.length", 1);
    cy.get(".away img").should("have.attr", "src").should("include", "Fram");
    cy.get(".halfstops-input").should("have.length", 4);
    cy.tick(ONE_MINUTE * 35);
    cy.get(".matchclock").should("have.text", "46:30");
    cy.contains("Heim").click();
    cy.contains("Pása").click();
    cy.contains("Hefja niðurtalningu").should("have.length", 0);
    cy.contains("Næsti hálfleikur").click();
    cy.tick(ONE_MINUTE);
    cy.get(".matchclock").should("have.text", "45:00");
    cy.contains("Stillingar").click();
    cy.get(".halfstops-input").should("have.length", 3);
    cy.contains("Heim").click();
    cy.contains("Byrja").click();
    cy.tick(ONE_MINUTE);
    cy.contains("+5m").click();
    cy.tick(ONE_MINUTE);
    cy.get(".matchclock").should("have.text", "52:00");
    cy.get(".longerInput").type("5");
    cy.get(".injury-time").should("have.text", "+5");
  });

  it("uses the simple control panel and updates the clock", () => {
    cy.contains("Stillingar").click();
    cy.get("#view-selector-match").click();
    cy.get(".match-type-selector").select("handball");
    cy.get("#view-selector-control").click();

    cy.contains("Stop").should("have.length", 0);
    cy.contains("Leikhlé").should("be.enabled");
    cy.contains("Start").click();
    cy.tick(ONE_MINUTE / 2);
    cy.contains("Stop").should("have.length", 1);
    cy.tick(ONE_MINUTE);
    cy.get(".matchclock").should("have.text", "01:30");
    cy.contains("Brottvísun").should("be.disabled");
    cy.get(".match-controller-box-home").contains("Leikhlé").click();
    cy.tick(1500);
    cy.contains("Start").should("have.length", 1);
    cy.contains("Start").should("be.disabled");
    cy.contains("Leikhlé").should("be.enabled");
    cy.get("audio").should("have.length", 1);
    cy.get(".timeoutclock").should("have.text", "00:59");
    cy.tick(30000);
    cy.get(".timeoutclock").should("have.text", "00:29");
    cy.get("audio").should("have.length", 0);
    cy.tick(20000);
    cy.get(".timeoutclock").should("have.text", "00:09");
    cy.get("audio").should("have.length", 1);
    cy.tick(5000);
    cy.get(".timeoutclock").should("have.text", "00:04");
    cy.get("audio").should("have.length", 0);
    cy.tick(5000);
    cy.get("audio").should("have.length", 1);
    cy.get(".timeoutclock").should("have.length", 0);
    cy.contains("Stop").should("have.length", 0);
    cy.contains("Start").should("have.length", 1);
    cy.tick(ONE_MINUTE);
    cy.get(".match-controller-box-home").contains("Brottvísun").click();
    cy.get(".matchclock").should("have.text", "01:30");
    cy.contains("Start").click();
    cy.tick(30000);
    cy.get(".team-timeout").should("have.length", 1);
    cy.get(".penalty").should("have.text", "01:30");
  });

  it("starts a countdown", () => {
    cy.contains("Stillingar").click();
    cy.get(".match-start-time-selector").type("13:30");
    cy.get("#view-selector-match").click();
    cy.contains("Heim").click();
    cy.contains("Hefja niðurtalningu").click();

    cy.tick(SECOND);
    cy.contains("Byrja").should("have.length", 0);
    cy.get(".matchclock").should("have.text", "89:59");
    cy.tick(60 * 60 * SECOND - 1);
    cy.get(".matchclock").should("have.text", "30:00");
    cy.tick(60 * 30 * SECOND);
    cy.get(".matchclock").should("have.text", "00:00");
    cy.tick(30 * SECOND);
    cy.get(".matchclock").should("have.text", "00:00");
    cy.contains("Byrja").should("have.length", 1);
  });
});
