const ONE_MINUTE = 60000;
const SECOND = 1000;

context("Match Flow - Complete Match Simulation", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.clock(new Date(2025, 3, 10, 14, 0, 0).getTime());
    cy.visit("/");
  });

  it("plays a complete football match with goals and half-time", () => {
    cy.contains("Stillingar").click();
    cy.get("#view-selector-match").click();
    cy.contains("Heim").click();

    cy.contains("Byrja").click();
    cy.tick(ONE_MINUTE * 10);
    cy.get(".matchclock").should("have.text", "10:00");

    cy.contains("H +1").click();
    cy.get(".team.home .score").should("have.text", "1");
    cy.get(".team.away .score").should("have.text", "0");

    cy.tick(ONE_MINUTE * 15);
    cy.get(".matchclock").should("have.text", "25:00");

    cy.contains("Ú +1").click();
    cy.get(".team.home .score").should("have.text", "1");
    cy.get(".team.away .score").should("have.text", "1");

    cy.tick(ONE_MINUTE * 15);
    cy.get(".matchclock").should("have.text", "40:00");

    cy.contains("H +1").click();
    cy.get(".team.home .score").should("have.text", "2");
    cy.get(".team.away .score").should("have.text", "1");

    cy.tick(ONE_MINUTE * 6);
    // With showInjuryTime:true (default), clock continues past 45:00
    cy.get(".matchclock").should("have.text", "46:00");

    cy.contains("Pása").click();
    cy.contains("Næsti hálfleikur").click();

    cy.contains("Stillingar").click();
    cy.get(".halfstops-input").should("have.length", 3);

    cy.contains("Heim").click();
    cy.contains("Byrja").click();

    cy.tick(ONE_MINUTE * 15);
    cy.get(".matchclock").should("have.text", "60:00");

    cy.contains("Ú +1").click();
    cy.get(".team.home .score").should("have.text", "2");
    cy.get(".team.away .score").should("have.text", "2");

    cy.tick(ONE_MINUTE * 25);
    cy.get(".matchclock").should("have.text", "85:00");

    cy.get(".longerInput").type("3");
    cy.get(".injury-time").should("have.text", "+3");

    cy.contains("H +1").click();
    cy.get(".team.home .score").should("have.text", "3");
    cy.get(".team.away .score").should("have.text", "2");

    cy.tick(ONE_MINUTE * 6);
    // With showInjuryTime:true (default), clock continues past 90:00 halfstop
    cy.get(".matchclock").should("have.text", "91:00");

    cy.get(".team.home .score").should("have.text", "3");
    cy.get(".team.away .score").should("have.text", "2");
  });

  it("handles goal corrections with H -1 button", () => {
    cy.contains("Stillingar").click();
    cy.get("#view-selector-match").click();
    cy.contains("Heim").click();

    cy.contains("Byrja").click();
    cy.tick(ONE_MINUTE * 5);

    cy.contains("H +1").click();
    cy.get(".team.home .score").should("have.text", "1");

    cy.contains("H -1").click();
    cy.get(".team.home .score").should("have.text", "0");
  });

  it("plays a complete handball match with period transitions", () => {
    cy.contains("Stillingar").click();
    cy.get(".match-type-selector").select("handball");
    cy.get("#view-selector-match").click();
    cy.contains("Heim").click();

    cy.contains("Byrja").click();

    cy.tick(ONE_MINUTE * 15);
    cy.get(".matchclock").should("have.text", "15:00");

    cy.contains("H +1").click();
    cy.contains("H +1").click();
    cy.contains("Ú +1").click();
    cy.get(".team.home .score").should("have.text", "2");
    cy.get(".team.away .score").should("have.text", "1");

    cy.tick(ONE_MINUTE * 15);
    cy.get(".matchclock").should("have.text", "30:00");

    cy.contains("Pása").click();
    cy.contains("Næsti hálfleikur").click();

    cy.contains("Byrja").click();
    cy.tick(ONE_MINUTE * 10);
    cy.get(".matchclock").should("have.text", "40:00");

    cy.contains("Ú +1").click();
    cy.contains("Ú +1").click();
    cy.get(".team.home .score").should("have.text", "2");
    cy.get(".team.away .score").should("have.text", "3");

    cy.tick(ONE_MINUTE * 20);
    cy.get(".matchclock").should("have.text", "60:00");
  });

  it("uses time adjustment buttons to modify elapsed time", () => {
    cy.contains("Stillingar").click();
    cy.get("#view-selector-match").click();
    cy.contains("Heim").click();

    cy.contains("Byrja").click();
    cy.tick(ONE_MINUTE * 10);
    cy.get(".matchclock").should("have.text", "10:00");

    cy.contains("+5m").click();
    cy.tick(100);
    cy.get(".matchclock").should("have.text", "15:00");

    cy.contains("+5m").click();
    cy.tick(100);
    cy.get(".matchclock").should("have.text", "20:00");

    cy.contains("-5m").click();
    cy.tick(100);
    cy.get(".matchclock").should("have.text", "15:00");
  });

  it("sets team logos and displays them on scoreboard", () => {
    cy.contains("Stillingar").click();
    cy.get("#team-selector-awayTeam").type("fram");
    cy.get("#view-selector-match").click();

    cy.get(".team.away img").should("have.attr", "src").should("include", "Fram");
  });

  it("uses Leiðrétta to switch to advanced controls", () => {
    cy.contains("Stillingar").click();
    cy.get("#view-selector-control").click();
    cy.get(".match-controller-box-home").contains("Mark").should("exist");

    cy.contains("Leiðrétta").click();

    cy.contains("Stillingar").click();
    cy.get("#view-selector-match").should("be.checked");
  });
});
