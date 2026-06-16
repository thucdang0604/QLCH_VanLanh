import assert from 'node:assert/strict';
import test from 'node:test';
import { filterFlashSaleProducts, isFlashSaleProduct } from './flashSale';

test('flash sale requires an explicit flag or a discount of at least ten percent', () => {
    assert.equal(isFlashSaleProduct({ isFlashSale: true }), true);
    assert.equal(isFlashSaleProduct({ price_original: 1_000_000, price_promo: 900_000 }), true);
    assert.equal(isFlashSaleProduct({ price: 1_000_000, price_promo: 850_000 }), true);
    assert.equal(isFlashSaleProduct({ price_original: 1_000_000, price_promo: 950_000 }), false);
    assert.equal(isFlashSaleProduct({ price_original: 1_000_000 }), false);
});

test('filter does not leak ordinary products into flash sale', () => {
    const products = [
        { id: 'regular', price: 1_000_000 },
        { id: 'discounted', price: 1_000_000, price_promo: 800_000 },
    ];

    assert.deepEqual(filterFlashSaleProducts(products).map(product => product.id), ['discounted']);
});
