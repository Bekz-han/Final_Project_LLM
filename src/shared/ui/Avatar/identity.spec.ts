import { describe, expect, it } from 'vitest';
import { IDENTITY_CLASSES, identitySlot, initials } from './identity';

/**
 * The two promises an avatar makes: the same person is always the same two letters, and always
 * the same colour. Both are trivial to break by refactoring, and neither breaks loudly — the
 * screen still renders, just with somebody else's circle.
 */

describe('initials', () => {
	it('puts the surname first, whichever way the screen prints the name', () => {
		expect(initials({ first: 'Дина', last: 'Каримова' })).toBe('КД');
	});

	it('reads a single stored name left to right, because that is the order it was typed in', () => {
		expect(initials('Айгерим Преподаватель')).toBe('АП');
	});

	it('stops at two letters', () => {
		expect(initials('Нургалиева Сауле Ержановна')).toBe('НС');
	});

	it('gives one letter to a one-word name rather than inventing a second', () => {
		expect(initials('Владелец')).toBe('В');
	});

	it('survives the spacing a form actually posts', () => {
		expect(initials('  Асель   Жумабаева ')).toBe('АЖ');
	});

	it('has something to show when there is no name at all', () => {
		expect(initials('   ')).toBe('—');
		expect(initials({ first: '', last: '' })).toBe('—');
	});

	it('uppercases what it was given in lower case', () => {
		expect(initials({ first: 'дина', last: 'каримова' })).toBe('КД');
	});
});

describe('identitySlot', () => {
	it('is inside the palette', () => {
		expect(identitySlot('01a0b40b-35e7-77b5-b350-62fc793334a4')).toBeLessThan(IDENTITY_CLASSES.length);
		expect(identitySlot('')).toBeGreaterThanOrEqual(0);
	});

	it('does not move', () => {
		// Pinned on purpose. These numbers have no meaning except that they must never change:
		// the day the hash is "simplified" is the day every avatar in the product changes colour.
		expect(identitySlot('01a0b40b-35e7-77b5-b350-62fc793334a4')).toBe(5);
		expect(identitySlot('01a0b368-912f-70b9-b9f5-db8b193caa69')).toBe(1);
		expect(identitySlot('01a0b367-3062-709c-8733-35f853721ff6')).toBe(0);
	});

	it('separates ids that share a long prefix', () => {
		// The case this exists for. Ours are uuid v7, whose leading bytes are a timestamp, so a
		// hash that reads a prefix hands one colour to every row created in the same batch —
		// exactly the rows an administrator most needs to tell apart.
		const shared = '01a0b40b-35e7-77b5-b350-62fc7933';
		const slots = new Set(
			['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008'].map((tail) =>
				identitySlot(`${shared}${tail}`),
			),
		);

		expect(slots.size).toBeGreaterThanOrEqual(4);
	});

	it('uses the whole palette', () => {
		const slots = new Set(Array.from({ length: 200 }, (_ignored, index) => identitySlot(`row-${String(index)}`)));

		expect(slots.size).toBe(IDENTITY_CLASSES.length);
	});
});
