// Vercel serverless function: returns the live Square menu.
// Required env vars (set in Vercel project settings, never commit them):
//   SQUARE_ACCESS_TOKEN     - read-only Production token from the Square Developer Dashboard
//   SQUARE_MENU_CATEGORY_ID - Square category ID for the public menu

const SQUARE_API = 'https://connect.squareup.com/v2/catalog/search-catalog-items';
const EXCLUDED_NAMES = new Set(['parking']);

function formatPrice(money) {
  if (!money || money.amount == null) return null;
  return '$' + (Number(money.amount) / 100).toFixed(2);
}

// Catering trays: one Square category per group. Items show all size variations.
const CATERING_GROUPS = [
  { label: 'Protein', categoryId: 'VJYKLDQEPMKFLAZ2FGT3ZWL2' },
  { label: 'Stews', categoryId: '2CI3YBBIUEJSXJ4ORMBWYCTR' },
  { label: 'Sides', categoryId: 'VEVXKHZ6UKM6WGYPDU73KXHK' }
];

function isVisible(item) {
  const d = item.item_data || {};
  if (d.is_archived) return false;
  if (d.ecommerce_visibility === 'UNAVAILABLE') return false;
  return true;
}

async function searchCategory(token, categoryId) {
  const r = await fetch(SQUARE_SEARCH_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Square-Version': '2024-08-21',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ category_ids: [categoryId], limit: 100 })
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Square API error');
  return data.items || [];
}

function toCateringItem(item) {
  const d = item.item_data || {};
  const rawDesc = d.description || '';
  return {
    id: item.id,
    name: d.name,
    // Hide placeholder text until the description is written in Square.
    description: rawDesc.includes('[DESCRIPTION') ? '' : rawDesc,
    sizes: (d.variations || [])
      .map(v => v.item_variation_data || {})
      .sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0))
      .map(vd => ({ name: vd.name, price: formatPrice(vd.price_money) }))
  };
}

async function handleCatering(token, res) {
  try {
    const groups = await Promise.all(CATERING_GROUPS.map(async g => {
      const items = (await searchCategory(token, g.categoryId))
        .filter(isVisible)
        .map(toCateringItem)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return { label: g.label, items };
    }));
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ groups });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load catering menu' });
  }
}

module.exports = async (req, res) => {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (req.query && req.query.section === 'catering') {
    return handleCatering(token, res);
  }
  const categoryId = process.env.SQUARE_MENU_CATEGORY_ID;
  if (!token || !categoryId) {
    res.status(500).json({ error: 'Missing SQUARE_ACCESS_TOKEN or SQUARE_MENU_CATEGORY_ID' });
    return;
  }

  try {
    const squareRes = await fetch(SQUARE_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Square-Version': '2024-08-21',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category_ids: [categoryId],
        limit: 100,
        include_related_objects: true
      })
    });
    const data = await squareRes.json();
    if (!squareRes.ok) {
      res.status(502).json({ error: 'Square API error', detail: data.errors || null });
      return;
    }

    const images = {};
    for (const obj of data.related_objects || []) {
      if (obj.type === 'IMAGE' && obj.image_data && obj.image_data.url) {
        images[obj.id] = obj.image_data.url;
      }
    }

    const items = (data.items || [])
      .filter(item => {
        const d = item.item_data || {};
        if (d.is_archived) return false;
        if (d.ecommerce_visibility === 'UNAVAILABLE') return false;
        if (EXCLUDED_NAMES.has((d.name || '').trim().toLowerCase())) return false;
        return true;
      })
      .map(item => {
        const d = item.item_data || {};
        const variation = (d.variations || [])[0];
        const vd = variation && variation.item_variation_data;
        const imageId = (d.image_ids || [])[0];
        return {
          id: item.id,
          name: d.name,
          description: d.description || '',
          price: formatPrice(vd && vd.price_money),
          image: imageId ? images[imageId] || null : null
        };
      });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({ items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load menu', detail: String(err) });
  }
};
