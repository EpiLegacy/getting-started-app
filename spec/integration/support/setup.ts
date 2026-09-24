import prepareDatabase from './prepareDatabase';

// Registered before the suite's own hooks, including application pool setup.
beforeAll(prepareDatabase);
