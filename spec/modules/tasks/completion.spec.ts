import { contradictsStatus, syncCompletion } from '../../../src/modules/tasks/completion';

describe('syncCompletion', () => {
    test('moving a card derives completed from its column', () => {
        expect(syncCompletion({ status: 'completed' }, 'todo')).toEqual({ status: 'completed', completed: true });
        expect(syncCompletion({ status: 'inProgress' }, 'completed')).toEqual({ status: 'inProgress', completed: false });
        expect(syncCompletion({ status: 'todo' }, 'inProgress')).toEqual({ status: 'todo', completed: false });
    });

    test('completing without a column moves the card to Completed', () => {
        expect(syncCompletion({ completed: true }, 'inProgress')).toEqual({ completed: true, status: 'completed' });
    });

    test('reopening a completed task puts it back in To do, other columns stay put', () => {
        expect(syncCompletion({ completed: false }, 'completed')).toEqual({ completed: false, status: 'todo' });
        expect(syncCompletion({ completed: false }, 'inProgress')).toEqual({ completed: false });
    });

    test('changes that touch neither field are left alone', () => {
        expect(syncCompletion({ name: 'Renamed' }, 'completed')).toEqual({ name: 'Renamed' });
    });

    test('a new task takes completed from the column it is created in', () => {
        const input = { name: 'Task', completed: false, deadline: '', priorisation: 'medium' as const, status: 'completed' as const };
        expect(syncCompletion(input)).toEqual({ ...input, completed: true });
    });
});

test('contradictsStatus only flags two fields that disagree', () => {
    expect(contradictsStatus({ completed: true, status: 'todo' })).toBe(true);
    expect(contradictsStatus({ completed: false, status: 'completed' })).toBe(true);
    expect(contradictsStatus({ completed: true, status: 'completed' })).toBe(false);
    expect(contradictsStatus({ completed: false, status: 'inProgress' })).toBe(false);
    expect(contradictsStatus({ completed: true })).toBe(false);
    expect(contradictsStatus({ status: 'todo' })).toBe(false);
});
