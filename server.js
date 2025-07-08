const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const csv = require("csv-parser");
const { parse } = require("json2csv");
const multer = require("multer");

const app = express();
const PORT = 3000;

const USERS_FILE = path.join(__dirname, "usuarios.csv");
const PRODUTOS_FILE = path.join(__dirname, "produtos.csv");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "views")));
app.use(express.static(path.join(__dirname, "assets")));

// === MULTER CONFIGURAÇÃO ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "assets", "imagens");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// === CRIA CSVs SE NÃO EXISTIREM ===
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "name,cpf,birthdate,email,password,role,cidade,estado,rua,numero,cep\n");
}
if (!fs.existsSync(PRODUTOS_FILE)) {
  fs.writeFileSync(PRODUTOS_FILE, "nome,preco,categoria,imagem,promocao\n");
}

// === ROTAS DE USUÁRIOS ===

app.post("/register", (req, res) => {
  const { name, cpf, birthdate, email, password, cidade, estado, rua, numero, cep } = req.body;
  const role = email.endsWith("@hamburgueria.com") ? "gerente" : "cliente";
  const newUser = { name, cpf, birthdate, email, password, role, cidade, estado, rua, numero, cep };

  let users = [];

  fs.createReadStream(USERS_FILE)
    .pipe(csv())
    .on("data", (row) => users.push(row))
    .on("end", () => {
      const emailExiste = users.some(user => user.email.trim().toLowerCase() === email.trim().toLowerCase());
      if (emailExiste) return res.status(400).json({ error: "Email já cadastrado" });

      const fields = ["name", "cpf", "birthdate", "email", "password", "role", "cidade", "estado", "rua", "numero", "cep"];
      const csvLine = parse([newUser], { fields, header: false });
      fs.appendFileSync(USERS_FILE, "\n" + csvLine);

      res.status(201).json(newUser);
    });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  let userFound = null;

  fs.createReadStream(USERS_FILE)
    .pipe(csv())
    .on("data", (row) => {
      if (row.email.trim().toLowerCase() === email.trim().toLowerCase()) userFound = row;
    })
    .on("end", () => {
      if (!userFound) return res.status(401).json({ error: "Email não cadastrado" });
      if (userFound.password.trim() === password.trim()) res.json(userFound);
      else res.status(401).json({ error: "Senha incorreta" });
    });
});

app.get("/users", (req, res) => {
  const users = [];
  fs.createReadStream(USERS_FILE)
    .pipe(csv())
    .on("data", (row) => users.push(row))
    .on("end", () => res.json(users));
});

app.post("/update-user-role", (req, res) => {
  const { email, role } = req.body;
  let users = [];
  fs.createReadStream(USERS_FILE)
    .pipe(csv())
    .on("data", (row) => users.push(row))
    .on("end", () => {
      const userIndex = users.findIndex(user => user.email === email);
      if (userIndex > -1) {
        users[userIndex].role = role;
        const fields = ["name", "cpf", "birthdate", "email", "password", "role", "cidade", "estado", "rua", "numero", "cep"];
        const csvData = parse(users, { fields });
        fs.writeFileSync(USERS_FILE, csvData);
        res.json({ message: `Papel do usuário ${email} atualizado para ${role}.` });
      } else {
        res.status(404).json({ error: "Usuário não encontrado." });
      }
    });
});

app.post("/update-users", (req, res) => {
  const novosUsuarios = req.body;
  const fields = ["name", "cpf", "birthdate", "email", "password", "role", "cidade", "estado", "rua", "numero", "cep"];
  const csvData = parse(novosUsuarios, { fields });

  fs.writeFile(USERS_FILE, csvData, (err) => {
    if (err) return res.status(500).json({ error: "Erro ao atualizar usuários" });
    res.status(200).json({ message: "Usuários atualizados com sucesso" });
  });
});

// === ROTAS DE PRODUTOS ===

app.get("/produtos", (req, res) => {
  const produtos = [];
  fs.createReadStream(PRODUTOS_FILE)
    .pipe(csv())
    .on("data", (row) => {
      row.nome = row.nome?.trim();
      row.categoria = row.categoria?.trim().toLowerCase();
      row.preco = parseFloat((row.preco || "").toString().replace(",", "."));
      row.imagem = row.imagem?.trim();
      row.promocao = (row.promocao || "").toString().toLowerCase() === "true";
      produtos.push(row);
    })
    .on("end", () => res.json(produtos));
});

app.post("/produtos", upload.single("imagem"), (req, res) => {
  try {
    const { nome, preco, categoria } = req.body;
    
    if (!nome || !preco || !categoria) {
      return res.status(400).json({ error: "Nome, preço e categoria são obrigatórios" });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: "Imagem é obrigatória" });
    }
    
    const imagemPath = `assets/imagens/${req.file.filename}`;
    const produto = {
      nome: nome.trim(),
      preco: parseFloat(preco),
      categoria: categoria.trim().toLowerCase(),
      imagem: imagemPath,
      promocao: false
    };

    // Ler produtos existentes
    const produtos = [];
    fs.createReadStream(PRODUTOS_FILE)
      .pipe(csv())
      .on("data", (row) => {
        if (row.nome && row.nome.trim()) {
          produtos.push({
            nome: row.nome.trim(),
            preco: parseFloat(row.preco) || 0,
            categoria: (row.categoria || "").trim().toLowerCase(),
            imagem: (row.imagem || "").trim(),
            promocao: (row.promocao || "").toString().toLowerCase() === "true"
          });
        }
      })
      .on("end", () => {
        try {
          // Adicionar novo produto
          produtos.push(produto);
          
          // Salvar todos os produtos
          const fields = ["nome", "preco", "categoria", "imagem", "promocao"];
          const csvData = parse(produtos, { fields });
          
          fs.writeFile(PRODUTOS_FILE, csvData, (err) => {
            if (err) {
              console.error("Erro ao salvar produto:", err);
              return res.status(500).json({ error: "Erro ao salvar produto" });
            }
            res.status(201).json({ message: "Produto cadastrado com sucesso!", produto });
          });
        } catch (error) {
          console.error("Erro ao processar produto:", error);
          res.status(500).json({ error: "Erro ao processar produto" });
        }
      })
      .on("error", (err) => {
        console.error("Erro ao ler arquivo de produtos:", err);
        res.status(500).json({ error: "Erro ao processar produtos" });
      });
  } catch (error) {
    console.error("Erro geral na adição de produto:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.put("/atualizar-produto", upload.single("imagem"), (req, res) => {
  try {
    const { nome, preco, categoria, nomeOriginal, categoriaOriginal } = req.body;
    
    if (!nome || !preco || !categoria || !nomeOriginal || !categoriaOriginal) {
      return res.status(400).json({ error: "Dados obrigatórios não fornecidos" });
    }
    
    const produtos = [];

    fs.createReadStream(PRODUTOS_FILE)
      .pipe(csv())
      .on("data", (row) => {
        if (row.nome && row.nome.trim()) {
          produtos.push({
            nome: row.nome.trim(),
            preco: parseFloat(row.preco) || 0,
            categoria: (row.categoria || "").trim().toLowerCase(),
            imagem: (row.imagem || "").trim(),
            promocao: (row.promocao || "").toString().toLowerCase() === "true"
          });
        }
      })
      .on("end", () => {
        try {
          const index = produtos.findIndex(p => {
            const nomeOk = p.nome?.trim().toLowerCase();
            const categoriaOk = p.categoria?.trim().toLowerCase();
            return nomeOk === nomeOriginal?.trim().toLowerCase() && categoriaOk === categoriaOriginal?.trim().toLowerCase();
          });

          if (index > -1) {
            // Usar nova imagem se fornecida, senão manter a existente
            const imagemPath = req.file ? `assets/imagens/${req.file.filename}` : produtos[index].imagem;
            
            produtos[index] = {
              nome: nome.trim(),
              preco: parseFloat(preco),
              categoria: categoria.toLowerCase(),
              imagem: imagemPath,
              promocao: false
            };

            const csvData = parse(produtos, { fields: ["nome", "preco", "categoria", "imagem", "promocao"] });
            fs.writeFile(PRODUTOS_FILE, csvData, (err) => {
              if (err) {
                console.error("Erro ao atualizar produto:", err);
                return res.status(500).json({ error: "Erro ao atualizar produto" });
              }
              res.status(200).json({ message: "Produto atualizado com sucesso!", produto: produtos[index] });
            });
          } else {
            res.status(404).json({ error: "Produto não encontrado" });
          }
        } catch (error) {
          console.error("Erro ao processar atualização:", error);
          res.status(500).json({ error: "Erro ao processar atualização" });
        }
      })
      .on("error", (err) => {
        console.error("Erro ao ler arquivo de produtos:", err);
        res.status(500).json({ error: "Erro ao processar produtos" });
      });
  } catch (error) {
    console.error("Erro geral na atualização de produto:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.use("/assets/imagens", express.static(path.join(__dirname, "assets", "imagens")));

app.delete("/excluir-produto", (req, res) => {
  try {
    const { nome, categoria } = req.body;
    
    if (!nome || !categoria) {
      return res.status(400).json({ error: "Nome e categoria são obrigatórios" });
    }
    
    const produtos = [];

    fs.createReadStream(PRODUTOS_FILE)
      .pipe(csv())
      .on("data", (row) => {
        if (row.nome && row.nome.trim()) {
          produtos.push({
            nome: row.nome.trim(),
            preco: parseFloat(row.preco) || 0,
            categoria: (row.categoria || "").trim().toLowerCase(),
            imagem: (row.imagem || "").trim(),
            promocao: (row.promocao || "").toString().toLowerCase() === "true"
          });
        }
      })
      .on("end", () => {
        try {
          const produtosFiltrados = produtos.filter(p => 
            !(p.nome.toLowerCase() === nome.toLowerCase() && p.categoria.toLowerCase() === categoria.toLowerCase())
          );
          
          const csvData = parse(produtosFiltrados, { fields: ["nome", "preco", "categoria", "imagem", "promocao"] });
          fs.writeFile(PRODUTOS_FILE, csvData, (err) => {
            if (err) {
              console.error("Erro ao excluir produto:", err);
              return res.status(500).json({ error: "Erro ao excluir produto" });
            }
            res.status(200).json({ message: "Produto removido com sucesso!" });
          });
        } catch (error) {
          console.error("Erro ao processar exclusão:", error);
          res.status(500).json({ error: "Erro ao processar exclusão" });
        }
      })
      .on("error", (err) => {
        console.error("Erro ao ler arquivo de produtos:", err);
        res.status(500).json({ error: "Erro ao processar produtos" });
      });
  } catch (error) {
    console.error("Erro geral na exclusão de produto:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// === INICIAR SERVIDOR ===
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

