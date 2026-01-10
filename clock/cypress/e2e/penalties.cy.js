const ONE_MINUTE = 60000;
const SECOND = 1000;

context("Penalty System - 2-Minute Suspensions", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.clock(new Date(2025, 3, 10, 14, 0, 0).getTime());
    cy.visit("/");
  });

  it("adds a 2-minute penalty and verifies countdown when match resumes", () => {
    cy.contains("Stillingar").click();
    cy.get(".match-type-selector").select("handball");
    cy.get("#view-selector-control").click();

    cy.contains("Start").click();
    cy.tick(ONE_MINUTE * 5);
    cy.get(".matchclock").should("have.text", "05:00");

    cy.contains("Stop").click();

    cy.get(".match-controller-box-home").contains("Brottvísun").click();
    cy.get(".penalty").should("have.length", 1);
    cy.get(".penalty").should("have.text", "02:00");

    cy.contains("Start").click();
    cy.tick(30 * SECOND);
    cy.get(".penalty").should("have.text", "01:30");

    cy.tick(30 * SECOND);
    cy.get(".penalty").should("have.text", "01:00");

    cy.tick(ONE_MINUTE + SECOND);
    cy.get(".penalty").should("have.length", 0);
  });

  it("handles multiple concurrent penalties on same team", () => {
    cy.contains("Stillingar").click();
    cy.get(".match-type-selector").select("handball");
    cy.get("#view-selector-control").click();

    cy.contains("Start").click();
    cy.tick(ONE_MINUTE * 5);
    cy.contains("Stop").click();

    cy.get(".match-controller-box-home").contains("Brottvísun").click();
    cy.get(".penalty").should("have.length", 1);

    cy.contains("Start").click();
    cy.tick(30 * SECOND);
    cy.contains("Stop").click();

    cy.get(".match-controller-box-home").contains("Brottvísun").click();
    cy.get(".penalty").should("have.length", 2);

    cy.contains("Start").click();

    cy.get(".penalty").first().should("have.text", "01:30");
    cy.get(".penalty").last().should("have.text", "02:00");

    cy.tick(90 * SECOND + SECOND);
    cy.get(".penalty").should("have.length", 1);

    cy.tick(30 * SECOND + SECOND);
    cy.get(".penalty").should("have.length", 0);
  });

  it("handles penalties on both teams simultaneously", () => {
    cy.contains("Stillingar").click();
    cy.get(".match-type-selector").select("handball");
    cy.get("#view-selector-control").click();

    cy.contains("Start").click();
    cy.tick(ONE_MINUTE * 5);
    cy.contains("Stop").click();

    cy.get(".match-controller-box-home").contains("Brottvísun").click();
    cy.contains("Start").click();
    cy.tick(10 * SECOND);
    cy.contains("Stop").click();
    cy.get(".match-controller-box-away").contains("Brottvísun").click();

    cy.get(".team.home .penalty").should("have.length", 1);
    cy.get(".team.away .penalty").should("have.length", 1);

    cy.contains("Start").click();
    cy.tick(110 * SECOND + SECOND);
    cy.get(".team.home .penalty").should("have.length", 0);
    cy.get(".team.away .penalty").should("have.length", 1);

    cy.tick(10 * SECOND + SECOND);
    cy.get(".team.away .penalty").should("have.length", 0);
  });

  it("penalty button is disabled when match clock is running", () => {
    cy.contains("Stillingar").click();
    cy.get(".match-type-selector").select("handball");
    cy.get("#view-selector-control").click();

    cy.get(".match-controller-box-home")
      .contains("Brottvísun")
      .should("not.be.disabled");

    cy.contains("Start").click();
    cy.tick(ONE_MINUTE);

    cy.get(".match-controller-box-home")
      .contains("Brottvísun")
      .should("be.disabled");

    cy.contains("Stop").click();

    cy.get(".match-controller-box-home")
      .contains("Brottvísun")
      .should("not.be.disabled");
  });

  it("penalty countdown pauses when match is paused", () => {
    cy.contains("Stillingar").click();
    cy.get(".match-type-selector").select("handball");
    cy.get("#view-selector-control").click();

    cy.contains("Start").click();
    cy.tick(ONE_MINUTE * 5);
    cy.contains("Stop").click();

    cy.get(".match-controller-box-home").contains("Brottvísun").click();
    cy.get(".penalty").should("have.text", "02:00");

    cy.contains("Start").click();
    cy.tick(30 * SECOND);
    cy.get(".penalty").should("have.text", "01:30");

    cy.contains("Stop").click();

    cy.tick(ONE_MINUTE);
    cy.get(".penalty").should("have.text", "01:30");

    cy.contains("Start").click();
    cy.tick(30 * SECOND);
    cy.get(".penalty").should("have.text", "01:00");
  });
});
