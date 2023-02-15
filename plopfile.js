module.exports = function (plop) {
  // create your generators here
  // Read more about templates at https://plopjs.com/
  plop.setGenerator("React Component Test template", {
    description: "this is a skeleton plopfile",
    prompts: [
      {
        type: "input",
        name: "fileName",
        message: "file name",
      },
    ],
    actions: [
      {
        type: "add",
        path: "lib/__tests__/{{fileName}}.test.js",
        templateFile: "plop-templates/test.js.hbs",
      },
    ],
  });
};
