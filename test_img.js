fetch('https://fixphone.vn/').then(r => r.text()).then(html => {
  const matches = html.match(/<img[^>]+src="([^"]+)"/g);
  if (matches) {
    console.log(matches.map(m => m.match(/src="([^"]+)"/)[1]).join('\n'));
  }
});
