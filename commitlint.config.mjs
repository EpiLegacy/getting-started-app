// Convention de commit de l'équipe : Conventional Commits v1.0.0
// https://www.conventionalcommits.org/en/v1.0.0/
//
// La configuration « config-conventional » fournit les types autorisés :
//   build · chore · ci · docs · feat · fix · perf · refactor · revert · style · test
//
// Format attendu :  type(scope facultatif): description
// Exemple        :  ci(pipeline): ajouter la vérification des messages de commit
export default {
    extends: ['@commitlint/config-conventional'],
};
