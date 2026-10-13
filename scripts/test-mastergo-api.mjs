const code =
  '<main data-name="test" class="flex flex-col w-[1440px] h-[800px] bg-[#FFFFFF]"><p data-name="t" class="text-[16px] text-[#111111]">test</p></main>';

const res = await fetch("http://127.0.0.1:50678/api/createPage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code }),
});

console.log("status", res.status);
console.log(await res.text());
