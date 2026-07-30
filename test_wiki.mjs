const query = "Eiffel Tower";
const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&format=json&origin=*`;
const res = await fetch(url);
const data = await res.json();
const pages = data.query?.pages;
if (pages) {
  const page = Object.values(pages)[0];
  console.log(page.imageinfo[0].url);
} else {
  console.log("No results");
}
