/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 50:"#f6f7f8",100:"#eceef1",200:"#d5d9df",300:"#b0b8c4",400:"#8592a3",500:"#657287",600:"#505b6e",700:"#424a59",800:"#393f4b",900:"#181b21" },
        petrol: { 50:"#eefbfa",100:"#d3f4f2",200:"#ace9e7",300:"#75d8d6",400:"#39bdbd",500:"#1fa1a3",600:"#158084",700:"#15676a",800:"#165256",900:"#124347" },
      },
      fontFamily: { sans: ["Inter","system-ui","sans-serif"] },
      fontSize: { xs:["0.75rem",{lineHeight:"1rem"}] },
    },
  },
  plugins: [],
};
