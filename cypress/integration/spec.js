
const ONE_MINUTE = 60000;

context('Basic navigation', () => {
    beforeEach(() => {
    // usually we recommend setting baseUrl in cypress.json
    // but for simplicity of this example we just use it here
    // https://on.cypress.io/visit
        cy.clearLocalStorage();
        // Need to start at 1 because 0 won't trigger started
        cy.clock(1);
        cy.visit('http://localhost:3000/');
    });

    it('starts the clock and does some things', () => {
        cy.get('#view-selector-match').click();
        cy.contains('Byrja').click();
        cy.tick(ONE_MINUTE / 2);
        cy.contains('Pása').should('have.length', 1);
        cy.tick(ONE_MINUTE);
        cy.get('.matchclock').should('have.text', '01:30');
        cy.get('#team-selector-awayTeam').type('fram');
        cy.tick(ONE_MINUTE * 10);
        cy.get('.matchclock').should('have.text', '11:30');
        cy.get('.away img').should('have.length', 1);
        cy.get('.away img').should('have.attr', 'src').should('include', 'Fram');
        cy.get('.halfstops-input').should('have.length', 4);
        cy.tick(ONE_MINUTE * 47);
        cy.get('.halfstops-input').should('have.length', 3);
        cy.contains('Byrja').click();
        cy.tick(ONE_MINUTE);
        cy.contains('+5mín').click();
        cy.tick(ONE_MINUTE);
        cy.get('.matchclock').should('have.text', '52:00');
        cy.contains('Uppbótartími').type('5');
        cy.get('.injury-time').should('have.text', '+5');
    });
});
