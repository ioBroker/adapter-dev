import { expect } from 'chai';
import { escapeRegExp } from './util';

describe('util/escapeRegExp()', () => {
    it('should escape special regex characters', () => {
        expect(escapeRegExp('hello.world')).to.equal('hello\\.world');
    });
});
