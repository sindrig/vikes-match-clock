const SECOND = 1000;

context("Asset Overlay System", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.clock(new Date(2025, 3, 10, 14, 0, 0).getTime());
    cy.visit("/");
  });

  it("adds a URL asset to the queue and displays queue count", () => {
    cy.contains("Heim").click();

    cy.get(".asset-controller").within(() => {
      cy.contains("0 í biðröð");

      cy.get('input[type="text"]').type("https://www.youtube.com/watch?v=test1");
      cy.contains("Bæta við").click();

      cy.contains("1 í biðröð");
    });
  });

  it("adds multiple assets to the queue", () => {
    cy.contains("Heim").click();

    cy.get(".asset-controller").within(() => {
      cy.get('input[type="text"]').type("https://www.youtube.com/watch?v=test1");
      cy.contains("Bæta við").click();

      cy.get('input[type="text"]').type("https://www.youtube.com/watch?v=test2");
      cy.contains("Bæta við").click();

      cy.get('input[type="text"]').type("https://www.youtube.com/watch?v=test3");
      cy.contains("Bæta við").click();

      cy.contains("3 í biðröð");
    });
  });

  it("clears the asset queue", () => {
    cy.contains("Heim").click();

    cy.get(".asset-controller").within(() => {
      cy.get('input[type="text"]').type("https://www.youtube.com/watch?v=test1");
      cy.contains("Bæta við").click();

      cy.get('input[type="text"]').type("https://www.youtube.com/watch?v=test2");
      cy.contains("Bæta við").click();

      cy.contains("2 í biðröð");
      cy.contains("Hreinsa biðröð").click();
    });

    cy.on("window:confirm", () => true);

    cy.get(".asset-controller").within(() => {
      cy.contains("0 í biðröð");
    });
  });

  it("shows Birta button when queue has items", () => {
    cy.contains("Heim").click();

    cy.get(".asset-controller").within(() => {
      cy.contains("Birta").should("not.exist");

      cy.get('input[type="text"]').type("https://www.youtube.com/watch?v=test1");
      cy.contains("Bæta við").click();

      cy.contains("Birta").should("exist");
    });
  });

  it("toggles autoplay and loop options", () => {
    cy.contains("Heim").click();

    cy.get(".asset-controller").within(() => {
      cy.contains("Autoplay")
        .find('input[type="checkbox"]')
        .should("not.be.checked");

      cy.contains("Autoplay").click();
      cy.contains("Autoplay")
        .find('input[type="checkbox"]')
        .should("be.checked");

      cy.get(".rs-input-number").should("exist");

      cy.contains("Loop").find('input[type="checkbox"]').should("not.be.checked");

      cy.contains("Loop").click();
      cy.contains("Loop").find('input[type="checkbox"]').should("be.checked");
    });
  });

  it("shows clear overlay button when asset is displayed", () => {
    cy.contains("Heim").click();

    cy.contains("Hreinsa virkt overlay").should("not.exist");

    cy.get(".asset-controller").within(() => {
      cy.get('input[type="text"]').type("https://www.youtube.com/watch?v=test1");
      cy.contains("Bæta við").click();
      cy.contains("Birta").click();
    });

    cy.contains("Hreinsa virkt overlay").should("exist");
  });

  it("clears active overlay when clear button is clicked", () => {
    cy.contains("Heim").click();

    cy.get(".asset-controller").within(() => {
      cy.get('input[type="text"]').type("https://www.youtube.com/watch?v=test1");
      cy.contains("Bæta við").click();
      cy.contains("Birta").click();
    });

    cy.contains("Hreinsa virkt overlay").should("exist");
    cy.get(".overlay-container").should("exist");

    cy.contains("Hreinsa virkt overlay").click();

    cy.contains("Hreinsa virkt overlay").should("not.exist");
    cy.get(".overlay-container").should("not.exist");
  });

  it("validates URL format before adding", () => {
    cy.contains("Heim").click();

    cy.get(".asset-controller").within(() => {
      cy.get('input[type="text"]').type("not-a-valid-url");
      cy.contains("Bæta við").click();

      cy.contains("is not a valid url");
      cy.contains("0 í biðröð");
    });
  });

  it("switches between Biðröð and Lið views", () => {
    cy.contains("Stillingar").click();
    cy.get("#team-selector-homeTeam").type("vikingur");
    cy.get("#team-selector-awayTeam").type("fram");

    cy.contains("Heim").click();

    cy.get(".asset-controller").within(() => {
      cy.contains("Biðröð").should("exist");
      cy.contains("Lið").should("exist");

      cy.contains("Lið").click();
    });

    cy.get(".team-asset-controller").should("exist");

    cy.get(".asset-controller").within(() => {
      cy.contains("Biðröð").click();
    });

    cy.get(".controls").should("exist");
  });
});
