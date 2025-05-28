const Module = require("module");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bytenode = require("bytenode");
// Herramienta de ruta de aplicación
const appPath = require("../../app-paths");

// Parámetros requeridos
// contraseña de compilación jsc
const LICENSE_PWD = process.env.LICENSE_PWD;
// .directorio de datos
const LICENSE_DIR = appPath.resolve.data(process.env.LICENSE_DIR);

const PASSWORD_REGEXP =
    /(?=^.{8,}$)(?=(?:.*?\d){2})(?=.*[a-z])(?=(?:.*?[A-Z]){2})(?=(?:.*?[!@#$%*()_+^&}{:;?.]){1})(?!.*\s)[0-9a-zA-Z!@#$%*()_+^&]*$/;
const PASSWORD = LICENSE_PWD;
if (!PASSWORD_REGEXP.test(PASSWORD)) {
    console.error(
        `
        Se requiere contraseña. Requisitos:
		- Mínimo 8 caracteres
		- Debe contener 1 número
		- Debe contener 2 letras minúsculas
		- Debe contener 2 letras mayúsculas
		- Debe contener 1 carácter especial
		`
    );
    process.exit();
}

const JSC_SRC_FILE_NAME = path.resolve(__dirname, "../index.jsc");
const MD5_FILE_NAME_FOR_JSC_SRC = path.resolve(__dirname, "../.md5");
const JS_SRC_FILE_NAME = path.resolve(__dirname, "src.js");
const MD5_FILE_NAME_FOR_JS_SRC = path.resolve(__dirname, "../src.md5");

const DATA_DIR = path.resolve(LICENSE_DIR);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const DATA_FILE_NAME = path.join(DATA_DIR, ".dat");

function getValueGenerator(value, { returnFunction = false } = {}) {
    let codePoints = String(value)
        .split("")
        .map((codepoint) => codepoint.codePointAt(0));

    let functionCode = `
    const codePoints = ${JSON.stringify(codePoints)};
    return codePoints.map(codePoint => String.fromCodePoint(codePoint)).join('');
    `
        .replace(/\n/g, "")
        .replace(/\s+/g, " ");

    return returnFunction
        ? new Function(functionCode)
        : `function getValue() { ${functionCode} }`;
}

(async () => {
    console.log(
        "------------------------------------------------------------------"
    );
    console.log("Start Build ...");

    // Leer el contenido del archivo fuente ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
    let fileContent = fs.readFileSync(JS_SRC_FILE_NAME, "utf8");
    // Leer el contenido del archivo fuente ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑

    // Leer el contenido del código fuente ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
    let [_, mainCodeString] = fileContent.match(
        /\/\/\smaincodebegin\s*([^]*)\n\/\/\s*maincodeend/
    );
    // Leer el contenido del código fuente ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑

    // Estructuración del contenido del código ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
    process.stdout.write("Building ...");
    let codeStringPasswordPartJSC = `// 密码 ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
const password = (${getValueGenerator(PASSWORD)})();
// 密码 ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑
`;
    let codeStringPasswordPartJS = `// 密码 ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
const password = '********';
// 密码 ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑
`;
    let codeStringMainCodePart = `// 源码本码区 ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
// maincodebegin
${mainCodeString}
// maincodeend
// 源码本码区 ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑
`;
    let codeStringJSC = bytenode.compileCode(
        Module.wrap(`${codeStringPasswordPartJSC}\n${codeStringMainCodePart}`)
    );
    fs.writeFileSync(JSC_SRC_FILE_NAME, codeStringJSC, "utf8");
    let codeStringJS = `${codeStringPasswordPartJS}\n${codeStringMainCodePart}`;
    fs.writeFileSync(JS_SRC_FILE_NAME, codeStringJS, "utf8");
    console.log("OK");
    // Estructuración del contenido del código ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑

    // generar md5 ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
    process.stdout.write("Generating md5 ...");
    let md5ForJscSrc = crypto
        .createHash("md5")
        .update(codeStringJSC)
        .digest("hex");
    fs.writeFileSync(MD5_FILE_NAME_FOR_JSC_SRC, md5ForJscSrc, "utf8");
    let md5ForJsSrc = crypto
        .createHash("md5")
        .update(codeStringJS)
        .digest("hex");
    fs.writeFileSync(MD5_FILE_NAME_FOR_JS_SRC, md5ForJsSrc, "utf8");
    console.log("OK");
    // generar md5 ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑

    // Generar datos iniciales ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
    process.stdout.write("Generating data ...");
    let initData = '{ "validatedDuration": 0 }';
    let key = crypto
        .createHash("sha256")
        .update(PASSWORD)
        .digest()
        .slice(0, 32);
    let iv = key.slice(0, 16);
    let cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encryptedData = Buffer.concat([
        cipher.update(initData),
        cipher.final(),
    ]);
    fs.writeFileSync(DATA_FILE_NAME, encryptedData, "utf8");
    console.log("OK");

    process.stdout.write("Validating ...");
    let decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let readEncrypedData = fs.readFileSync(DATA_FILE_NAME);
    let decryptedData = Buffer.concat([
        decipher.update(readEncrypedData),
        decipher.final(),
    ]).toString();
    if (decryptedData === initData) {
        console.log("OK");
    } else {
        console.log(`ERROR: ${decryptedData} !== ${initData}`);
    }
    // Generar datos iniciales ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑

    console.log("Build Success .");

    console.log(`index.jsc MD5 = \n${getValueGenerator(md5ForJscSrc)}`);

    console.log(
        "------------------------------------------------------------------"
    );
})();
