import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc
} from 'firebase/firestore';

// Contexto para Firebase y usuario autenticado
const FirebaseContext = createContext(null);

// Utility for unit conversion (Ahora más robusto para todas las conversiones solicitadas)
const convertUnits = (value, fromUnit, toUnit) => {
  const standardizedFromUnit = fromUnit.toLowerCase();
  const standardizedToUnit = toUnit.toLowerCase();

  if (standardizedFromUnit === standardizedToUnit) {
    return value;
  }

  // Conversion factors to a common base (gram for mass, cubic centimeter for volume)
  // 1 ml = 1 cc
  const conversionFactors = {
      'mass': {
          'g': 1,
          'kg': 1000
      },
      'volume': {
          'ml': 1,
          'lt': 1000,
          'cc': 1 
      },
      'count': {
          'unidad': 1
      }
  };

  let fromCategory = '';
  if (conversionFactors.mass[standardizedFromUnit]) fromCategory = 'mass';
  else if (conversionFactors.volume[standardizedFromUnit]) fromCategory = 'volume';
  else if (conversionFactors.count[standardizedFromUnit]) fromCategory = 'count';

  let toCategory = '';
  if (conversionFactors.mass[standardizedToUnit]) toCategory = 'mass';
  else if (conversionFactors.volume[standardizedToUnit]) toCategory = 'volume';
  else if (conversionFactors.count[standardizedToUnit]) toCategory = 'count';

  if (fromCategory !== toCategory || fromCategory === '') {
      console.warn(`Attempting incompatible unit conversion: ${fromUnit} (${fromCategory}) to ${toUnit} (${toCategory})`);
      return null;
  }

  const valueInBase = value * conversionFactors[fromCategory][standardizedFromUnit];
  const result = valueInBase / conversionFactors[toCategory][standardizedToUnit];

  return result;
};


// Componente principal de la aplicación
const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null); 
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [initializationError, setInitializationError] = useState(null);

  useEffect(() => {
    try {
      // *******************************************************************
      // IMPORTANTE: CONFIGURACIÓN DE FIREBASE
      // Asegúrate de que estas variables de entorno estén configuradas en Netlify/Vercel
      // Y en tu archivo .env.local para desarrollo local.
      // *******************************************************************
      
      const firebaseConfig = {
        apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
        authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
        storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.REACT_APP_FIREBASE_APP_ID
      };
      
      // *******************************************************************
      // FIN IMPORTANTE: CONFIGURACIÓN DE FIREBASE
      // *******************************************************************


      if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        const errorMessage = "Las variables de entorno de Firebase no están configuradas correctamente. Por favor, verifica tu archivo .env.local (para desarrollo local) o las variables de entorno en tu plataforma de despliegue.";
        console.error(errorMessage);
        setInitializationError(errorMessage);
        setIsAuthReady(true); 
        return;
      }

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);
      setDb(firestore);
      setAuth(authInstance);

      const unsubscribe = onAuthStateChanged(authInstance, (firebaseUser) => {
        if (firebaseUser) {
          setUser(firebaseUser); 
          console.log("Usuario autenticado. UID:", firebaseUser.uid);
        } else {
          setUser(null);
          console.log("No hay usuario autenticado. Esperando inicio de sesión.");
        }
        setIsAuthReady(true); 
      }, (error) => {
        console.error("Error en onAuthStateChanged:", error);
        setInitializationError("Error al monitorear el estado de autenticación: " + error.message);
        setIsAuthReady(true); 
      });

      return () => unsubscribe(); 
    } catch (error) {
      console.error("Error al inicializar Firebase:", error);
      setInitializationError("Error al inicializar el SDK de Firebase: " + error.message);
      setIsAuthReady(true); 
    }
  }, []);

  const handleGoogleSignIn = async () => {
    if (!auth) {
      setInitializationError("Firebase Auth no está inicializado.");
      return;
    }
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/userinfo.email');
    provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
    
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error al iniciar sesión con Google:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        console.warn("El popup de inicio de sesión fue cerrado por el usuario.");
      } else {
        setInitializationError("Error al iniciar sesión con Google: " + error.message);
      }
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setUser(null);
      setCurrentPage('dashboard');
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      setInitializationError("Error al cerrar sesión: " + error.message);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-pink-50">
        <div className="text-xl font-semibold text-pink-700">Cargando aplicación...</div>
      </div>
    );
  }

  if (initializationError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-red-200 text-red-700 text-center">
          <h2 className="text-2xl font-bold mb-4">¡Oops! Error al iniciar la aplicación:</h2>
          <p className="mb-4">{initializationError}</p>
          <p>Por favor, revisa:</p>
          <ul className="list-disc list-inside text-left mx-auto max-w-md">
            <li>La configuración de tu proyecto en la Consola de Firebase (especialmente la habilitación del proveedor de Google en Authentication &gt; Sign-in method).</li>
            <li>**Los dominios autorizados para OAuth en la Consola de Firebase y en Google Cloud Platform.**</li>
            <li>Tu archivo `.env.local` (si estás en desarrollo local y usando `process.env`).</li>
            <li>Las reglas de seguridad de Firestore en Firebase.</li>
          </ul>
          <p className="mt-4">Recarga la página después de corregir el problema.</p>
        </div>
      </div>
    );
  }

  // currentAppId para el despliegue con process.env
  const currentAppId = process.env.REACT_APP_FIREBASE_PROJECT_ID || "mrp-final-app";

  const NavBar = ({ setCurrentPage, user, handleGoogleSignIn, handleSignOut }) => (
    <nav className="bg-gradient-to-r from-pink-300 to-rose-200 p-4 shadow-lg rounded-b-3xl mb-6">
      <div className="container mx-auto flex flex-wrap justify-between items-center">
        {/* Título con logo */}
        <button 
          onClick={() => setCurrentPage('dashboard')}
          className="text-3xl font-extrabold text-pink-900 tracking-wide flex items-center focus:outline-none hover:opacity-80 transition-opacity duration-200"
        >
          <img
            src="/logo_cyc.jpg" // Ahora apunta a tu logo en la carpeta public
            alt="Logo Pyme Cookies and Cake" // Puedes hacer el alt más descriptivo
            className="h-10 w-10 mr-2 rounded-full shadow-md" // Puedes ajustar el tamaño o estilo aquí
          />
          Cookies and Cakes
        </button>
        <div className="flex space-x-2 sm:space-x-4 mt-2 sm:mt-0 items-center">
          {user ? ( 
            <>
              <NavLink label="Inventario" page="inventory" setCurrentPage={setCurrentPage} />
              <NavLink label="Recetas" page="recipes" setCurrentPage={setCurrentPage} />
              <NavLink label="Nota de Venta" page="sales_note" setCurrentPage={setCurrentPage} />
              <NavLink label="Conversor de Unidades" page="converter" setCurrentPage={setCurrentPage} /> {/* Nuevo NavLink */}
              <button
                onClick={handleSignOut}
                className="px-4 py-2 rounded-xl bg-pink-700 text-white font-semibold hover:bg-pink-800 transition duration-300 transform hover:scale-105 shadow-md flex items-center"
              >
                Cerrar Sesión {user.displayName ? `(${user.displayName.split(' ')[0]})` : ''}
              </button>
            </>
          ) : ( 
            <button
              onClick={handleGoogleSignIn}
              className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition duration-300 transform hover:scale-105 shadow-md flex items-center"
            >
              Iniciar Sesión con Gmail 
              <span className="ml-2 text-lg">📧</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );

  const NavLink = ({ label, page, setCurrentPage }) => (
    <button
      onClick={() => setCurrentPage(page)}
      className="px-3 py-2 rounded-xl text-pink-800 font-medium hover:bg-pink-100 hover:text-pink-900 transition duration-300 transform hover:scale-105 shadow-sm"
    >
      {label}
    </button>
  );

  const renderPage = () => {
    if (!user) {
      return (
        <div className="bg-white p-10 rounded-2xl shadow-xl border border-pink-100 text-center flex flex-col items-center justify-center min-h-[400px]">
          <h2 className="text-4xl font-extrabold text-pink-800 mb-6">¡Bienvenido a Cookies and Cakes!</h2>
          <p className="text-xl text-gray-700 mb-8">
            Por favor, inicia sesión con tu cuenta de Gmail para acceder a tu sistema de inventario y MRP.
          </p>
          <button
            onClick={handleGoogleSignIn}
            className="px-8 py-4 rounded-xl bg-purple-600 text-white font-bold text-lg hover:bg-purple-700 transition duration-300 transform hover:scale-110 shadow-lg flex items-center justify-center"
          >
            Iniciar Sesión con Gmail 
            <span className="ml-3 text-2xl">📧</span>
          </button>
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return <Inventory />;
      case 'recipes':
        return <Recipes />;
      case 'sales_note':
        return <SalesNote />;
      case 'converter':
        return <UnitConverterPage />; // Nueva página para el conversor
      default:
        return <Dashboard />;
    }
  };

  return (
    <FirebaseContext.Provider value={{ db, auth, userId: user ? user.uid : null, appId: currentAppId, userEmail: user ? user.email : null }}>
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-rose-50 to-white font-inter">
        <NavBar 
          setCurrentPage={setCurrentPage} 
          user={user} 
          handleGoogleSignIn={handleGoogleSignIn} 
          handleSignOut={handleSignOut} 
        />
        <main className="container mx-auto px-4 py-6">
          {renderPage()}
        </main>
      </div>
    </FirebaseContext.Provider>
  );
};

// --- Componentes Individuales para cada sección ---

const Dashboard = () => {
  const { db, userId, appId } = useContext(FirebaseContext);
  const [recipesCount, setRecipesCount] = useState(0);
  const [inventoryCount, setInventoryCount] = useState(0); 

  useEffect(() => {
    if (!db || !userId) return;

    const recipesRef = collection(db, `artifacts/${appId}/users/${userId}/recipes`);
    const unsubscribeRecipes = onSnapshot(recipesRef, (snapshot) => {
      setRecipesCount(snapshot.size);
    }, (error) => console.error("Error fetching recipes count:", error));

    const inventoryRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);
    const unsubscribeInventory = onSnapshot(inventoryRef, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInventoryCount(itemsData.length); 
    }, (error) => console.error("Error fetching inventory count:", error));

    return () => {
      unsubscribeRecipes();
      unsubscribeInventory();
    };
  }, [db, userId, appId]);

  return (
    <div className="bg-white p-8 rounded-3xl shadow-2xl border border-pink-100">
      <h2 className="text-4xl font-extrabold text-pink-800 mb-8 text-center">Resumen de Cookies and Cakes</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <StatCard title="Total Recetas" value={recipesCount} icon="📝" bgColor="bg-pink-300" textColor="text-pink-900" />
        <StatCard title="Items en Inventario" value={inventoryCount} icon="📦" bgColor="bg-rose-200" textColor="text-rose-900" />
      </div>
      <p className="text-center text-gray-600 mt-12 text-lg">
        ¡Bienvenido a tu panel de control! Aquí puedes ver un resumen rápido de tus datos más importantes.
      </p>
    </div>
  );
};

const StatCard = ({ title, value, icon, bgColor, textColor }) => (
  <div className={`flex flex-col items-center justify-center p-6 rounded-3xl ${bgColor} ${textColor} shadow-lg transform hover:scale-105 transition duration-300 ease-in-out`}>
    <div className="text-6xl mb-4">{icon}</div>
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-5xl font-bold">{value}</p>
  </div>
);

// Inventory Component (Modificado para separar cantidad y tipo de unidad, y dos tablas)
const Inventory = () => {
  const { db, userId, appId } = useContext(FirebaseContext);
  const [items, setItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnitValue, setNewItemUnitValue] = useState(''); // Cantidad de la unidad (ej. 100 para 100g)
  const [newItemUnitType, setNewItemUnitType] = useState('g'); // Tipo de unidad (ej. g, cc)
  const [newItemStock, setNewItemStock] = useState(''); // Stock total (número de estas unidades)
  const [editingItemId, setEditingItemId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  // Opciones de unidades: g, cc, unidad (kg, lt, ml eliminadas de aquí)
  const unitOptions = ['g', 'cc', 'unidad'];

  useEffect(() => {
    if (!db || !userId) return;

    const inventoryRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);
    const unsubscribe = onSnapshot(inventoryRef, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(itemsData.sort((a, b) => a.name.localeCompare(b.name))); 
    }, (error) => {
      console.error("Error fetching inventory items:", error);
      showInfoModal('Error al cargar el inventario: ' + error.message);
    });

    return () => unsubscribe();
  }, [db, userId, appId]);

  const showInfoModal = (message) => {
    setModalMessage(message);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMessage('');
  };

  const handleAddOrUpdateItem = async () => {
    if (!newItemName.trim() || !newItemUnitValue || !newItemUnitType.trim() || newItemStock === '') {
      showInfoModal('Todos los campos son obligatorios.');
      return;
    }
    const unitValue = parseFloat(newItemUnitValue);
    const stock = parseFloat(newItemStock);
    
    if (isNaN(unitValue) || unitValue <= 0 || isNaN(stock) || stock < 0) {
      showInfoModal('La cantidad por unidad y el stock deben ser números positivos.');
      return;
    }

    try {
      if (editingItemId) {
        const itemRef = doc(db, `artifacts/${appId}/users/${userId}/inventory`, editingItemId);
        await updateDoc(itemRef, {
          name: newItemName,
          unit_value: unitValue, // Store numerical part of unit
          unit_type: newItemUnitType, // Store unit type
          stock: stock, // Store number of packages/units
          type: 'raw_material', 
        });
        showInfoModal('Artículo de inventario actualizado con éxito! 🎉');
      } else {
        const inventoryRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);
        await addDoc(inventoryRef, {
          name: newItemName,
          unit_value: unitValue,
          unit_type: newItemUnitType,
          stock: stock,
          type: 'raw_material', 
          createdAt: new Date(), 
        });
        showInfoModal('Artículo de inventario añadido con éxito! ✨');
      }
      resetForm();
    } catch (e) {
      console.error("Error adding/updating inventory item: ", e);
      showInfoModal('Error al guardar el artículo. Inténtalo de nuevo.');
    }
  };

  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    setNewItemName(item.name);
    setNewItemUnitValue(item.unit_value.toString());
    setNewItemUnitType(item.unit_type);
    setNewItemStock(item.stock.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const handleDeleteItem = async (id) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este artículo del inventario?')) {
      try {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/inventory`, id));
        showInfoModal('Artículo eliminado con éxito! 🗑️');
      } catch (e) {
        console.error("Error removing inventory item: ", e);
        showInfoModal('Error al eliminar el artículo. Inténtalo de nuevo.');
      }
    }
  };

  const handleStockChange = async (itemId, newStockValue) => {
    const stock = parseFloat(newStockValue);
    if (isNaN(stock) || stock < 0) {
      showInfoModal('El stock debe ser un número positivo.');
      return;
    }
    try {
      const itemRef = doc(db, `artifacts/${appId}/users/${userId}/inventory`, itemId);
      await updateDoc(itemRef, { stock: stock });
    } catch (e) {
      console.error("Error updating stock:", e);
      showInfoModal('Error al actualizar stock. Inténtalo de nuevo.');
    }
  };

  const resetForm = () => {
    setEditingItemId(null);
    setNewItemName('');
    setNewItemUnitValue('');
    setNewItemUnitType('g'); 
    setNewItemStock('');
  };

  const rawMaterials = items.filter(item => item.type === 'raw_material');
  const finishedGoods = items.filter(item => item.type === 'finished_good');


  return (
    <div className="bg-white p-8 rounded-3xl shadow-2xl border border-pink-100">
      <h2 className="text-3xl font-extrabold text-pink-800 mb-6 text-center">Gestión de Inventario 📦</h2>

      {/* Formulario de Añadir/Editar Materia Prima */}
      <div className="mb-8 p-6 bg-rose-50 rounded-2xl border border-rose-100 shadow-inner">
        <h3 className="text-2xl font-bold text-pink-700 mb-4">{editingItemId ? 'Editar Materia Prima' : 'Añadir Nueva Materia Prima'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 items-end">
          <div>
            <label htmlFor="itemName" className="block text-gray-700 text-sm font-semibold mb-2">Nombre</label>
            <input
              type="text"
              id="itemName"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Ej: Harina de Trigo"
            />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2"> {/* Grouping unit inputs */}
            <div>
              <label htmlFor="itemUnitValue" className="block text-gray-700 text-sm font-semibold mb-2">Cantidad por Unidad (ej. 100)</label>
              <input
                type="number"
                id="itemUnitValue"
                className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                value={newItemUnitValue}
                onChange={(e) => setNewItemUnitValue(e.target.value)}
                min="0"
                placeholder="Ej: 100"
              />
            </div>
            <div>
              <label htmlFor="itemUnitType" className="block text-gray-700 text-sm font-semibold mb-2">Tipo de Unidad (ej. g)</label>
              <select
                id="itemUnitType"
                className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
                value={newItemUnitType}
                onChange={(e) => setNewItemUnitType(e.target.value)}
              >
                {unitOptions.map(unit => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="itemStock" className="block text-gray-700 text-sm font-semibold mb-2">Stock Actual (Total de Unidades)</label>
            <input
              type="number"
              id="itemStock"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={newItemStock}
              onChange={(e) => setNewItemStock(e.target.value)}
              min="0"
              placeholder="10"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={resetForm}
            className="px-6 py-3 bg-gray-300 text-gray-800 rounded-xl hover:bg-gray-400 transition duration-200 shadow-lg font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={handleAddOrUpdateItem}
            className="px-6 py-3 bg-pink-600 text-white rounded-xl hover:bg-pink-700 transition duration-200 shadow-lg font-bold"
          >
            {editingItemId ? 'Actualizar Materia Prima' : 'Guardar Materia Prima'}
          </button>
        </div>
      </div>

      {/* Tabla de Inventario de Materias Primas */}
      <h3 className="text-2xl font-extrabold text-pink-800 mb-5 text-center">Inventario de Materias Primas 🌾🥚</h3>
      {rawMaterials.length === 0 ? (
        <p className="text-center text-gray-600 text-lg">No hay materias primas registradas. ¡Añade algunas!</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl shadow-lg border border-pink-100 mb-8">
          <table className="min-w-full bg-white border-collapse">
            <thead className="bg-pink-100 border-b border-pink-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Unidad Medida Base</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Stock Actual</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-pink-700 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pink-50">
              {rawMaterials.map((item) => (
                <tr key={item.id} className="hover:bg-pink-50 transition duration-150 ease-in-out">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.unit_value} {item.unit_type}</td> {/* Display unit value and type */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    <input
                      type="number"
                      value={item.stock}
                      onChange={(e) => handleStockChange(item.id, e.target.value)}
                      onBlur={(e) => handleStockChange(item.id, e.target.value)}
                      min="0"
                      className="w-24 p-2 border border-pink-200 rounded-md focus:outline-none focus:ring-1 focus:ring-pink-400 text-center"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEditItem(item)}
                      className="inline-flex items-center p-2 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-100 transition duration-200 mr-2"
                      aria-label="Editar artículo"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.103 8.355L4 17.5V14.076l6.207-6.207 3.427 3.427z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="inline-flex items-center p-2 rounded-lg text-red-600 hover:text-red-800 hover:bg-red-100 transition duration-200"
                      aria-label="Eliminar artículo"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla de Productos Terminados en Stock */}
      <h3 className="text-2xl font-extrabold text-pink-800 mb-5 text-center">Productos Terminados en Stock 🍰🍪</h3>
      {finishedGoods.length === 0 ? (
        <p className="text-center text-gray-600 text-lg">No hay productos terminados en stock. ¡Produce algunos en la sección de Recetas! 🎂</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl shadow-lg border border-pink-100">
          <table className="min-w-full bg-white border-collapse">
            <thead className="bg-pink-100 border-b border-pink-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Unidad Medida Base</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Stock Actual</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-pink-700 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pink-50">
              {finishedGoods.map((item) => (
                <tr key={item.id} className="hover:bg-pink-50 transition duration-150 ease-in-out">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.unit_value} {item.unit_type}</td> {/* Display unit value and type */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    <input
                      type="number"
                      value={item.stock}
                      onChange={(e) => handleStockChange(item.id, e.target.value)}
                      onBlur={(e) => handleStockChange(item.id, e.target.value)}
                      min="0"
                      className="w-24 p-2 border border-pink-200 rounded-md focus:outline-none focus:ring-1 focus:ring-pink-400 text-center"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEditItem(item)}
                      className="inline-flex items-center p-2 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-100 transition duration-200 mr-2"
                      aria-label="Editar artículo"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.103 8.355L4 17.5V14.076l6.207-6.207 3.427 3.427z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="inline-flex items-center p-2 rounded-lg text-red-600 hover:text-red-800 hover:bg-red-100 transition duration-200"
                      aria-label="Eliminar artículo"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && <InfoModal message={modalMessage} onClose={closeModal} />}
    </div>
  );
};

// Recipes Component (Modificado para linkear con Inventario y confirmar producción)
const Recipes = () => {
  const { db, userId, appId } = useContext(FirebaseContext);
  const [recipes, setRecipes] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]); // Para autocompletar y verificar stock
  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeType, setNewRecipeType] = useState('cookie');
  const [newIngredients, setNewIngredients] = useState([{ name: '', quantity: '', unit: 'g' }]); // Default unit
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [productionQuantity, setProductionQuantity] = useState(1); // Cantidad a producir de una receta

  // Opciones de unidades: g, cc, unidad (kg, lt, ml eliminadas de aquí)
  const unitOptions = ['g', 'cc', 'unidad'];
  // Opciones de tipo de producto para recetas
  const recipeTypeOptions = [
    { value: 'cookie', label: 'Galleta 🍪' },
    { value: 'cake', label: 'Torta 🎂' },
    { value: 'reposteria', label: 'Repostería 🧁' },
    { value: 'personalizados', label: 'Personalizados ✨' }
  ];

  useEffect(() => {
    if (!db || !userId) return;

    // Escucha recetas
    const recipesRef = collection(db, `artifacts/${appId}/users/${userId}/recipes`);
    const unsubscribeRecipes = onSnapshot(recipesRef, (snapshot) => {
      const recipesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecipes(recipesData.sort((a, b) => a.name.localeCompare(b.name)));
    }, (error) => console.error("Error fetching recipes:", error));

    // Escucha todos los ítems de inventario (para ingredientes y deducción)
    const inventoryRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);
    const unsubscribeInventory = onSnapshot(inventoryRef, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInventoryItems(itemsData);
    }, (error) => console.error("Error fetching inventory for recipes:", error));

    return () => {
      unsubscribeRecipes();
      unsubscribeInventory();
    };
  }, [db, userId, appId]);

  const showInfoModal = (message) => {
    setModalMessage(message);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMessage('');
  };

  const handleAddIngredient = () => {
    setNewIngredients([...newIngredients, { name: '', quantity: '', unit: 'g' }]); // Default unit for new ingredient
  };

  const handleRemoveIngredient = (index) => {
    const updatedIngredients = newIngredients.filter((_, i) => i !== index);
    setNewIngredients(updatedIngredients);
  };

  const handleIngredientChange = (index, field, value) => {
    const updatedIngredients = newIngredients.map((ingredient, i) =>
      i === index ? { ...ingredient, [field]: value } : ingredient
    );
    setNewIngredients(updatedIngredients);
  };

  const handleAddOrUpdateRecipe = async () => {
    if (!newRecipeName.trim()) {
      showInfoModal('El nombre de la receta no puede estar vacío.');
      return;
    }
    const filteredIngredients = newIngredients.filter(
      (ing) => ing.name.trim() && parseFloat(ing.quantity) > 0 && ing.unit.trim()
    );
    if (filteredIngredients.length === 0) {
      showInfoModal('Por favor, añade al menos un ingrediente válido para la receta.');
      return;
    }

    // Opcional: Verificar si los ingredientes existen en el inventario antes de guardar la receta
    const missingIngredients = filteredIngredients.filter(ing => 
      !inventoryItems.some(item => item.name.toLowerCase() === ing.name.toLowerCase() && item.type === 'raw_material')
    );
    if(missingIngredients.length > 0) {
      const missingNames = missingIngredients.map(ing => ing.name).join(', ');
      showInfoModal(`Algunos ingredientes no están registrados como materia prima en tu inventario: ${missingNames}. Por favor, añádelos en la sección de Inventario.`);
      return; 
    }

    try {
      if (editingRecipeId) {
        const recipeRef = doc(db, `artifacts/${appId}/users/${userId}/recipes`, editingRecipeId);
        await updateDoc(recipeRef, {
          name: newRecipeName,
          type: newRecipeType,
          ingredients: filteredIngredients.map(ing => ({
            name: ing.name,
            quantity: parseFloat(ing.quantity), 
            unit: ing.unit,
          })),
        });
        showInfoModal('Receta actualizada con éxito! 🎉');
      } else {
        const recipesRef = collection(db, `artifacts/${appId}/users/${userId}/recipes`);
        await addDoc(recipesRef, {
          name: newRecipeName,
          type: newRecipeType,
          ingredients: filteredIngredients.map(ing => ({
            name: ing.name,
            quantity: parseFloat(ing.quantity),
            unit: ing.unit,
          })),
        });
        showInfoModal('Receta añadida con éxito! ✨');
      }
      resetForm();
    } catch (e) {
      console.error("Error adding/updating recipe: ", e);
      showInfoModal('Error al guardar la receta. Inténtalo de nuevo.');
    }
  };

  const handleEditRecipe = (recipe) => {
    setEditingRecipeId(recipe.id);
    setNewRecipeName(recipe.name);
    setNewRecipeType(recipe.type);
    setNewIngredients(recipe.ingredients.length > 0 ? recipe.ingredients : [{ name: '', quantity: '', unit: 'g' }]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRecipe = async (id) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta receta?')) {
      try {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/recipes`, id));
        showInfoModal('Receta eliminada con éxito! 🗑️');
      } catch (e) {
        console.error("Error removing recipe: ", e);
        showInfoModal('Error al eliminar la receta. Inténtalo de nuevo.');
      }
    }
  };

  const resetForm = () => {
    setEditingRecipeId(null);
    setNewRecipeName('');
    setNewRecipeType('cookie');
    setNewIngredients([{ name: '', quantity: '', unit: 'g' }]);
  };

  const handleConfirmProduction = async (recipe, quantityToProduce) => {
    if (!db || !userId) {
      showInfoModal('Error: No estás autenticado o la base de datos no está disponible.');
      return;
    }
    if (quantityToProduce <= 0) {
      showInfoModal('La cantidad a producir debe ser mayor que cero.');
      return;
    }

    let canProduce = true;
    const shortageMessages = [];
    const updatedInventoryPromises = [];
    const deductions = [];

    // 1. Calcular requerimientos y verificar stock
    for (const ing of recipe.ingredients) {
      const requiredAmountRecipeBase = parseFloat(ing.quantity); // Cantidad de receta en su propia unidad
      const requiredUnitRecipe = ing.unit; // Unidad de receta

      const inventoryItem = inventoryItems.find(item => 
        item.name.toLowerCase() === ing.name.toLowerCase() && item.type === 'raw_material'
      );

      if (!inventoryItem) {
        canProduce = false;
        shortageMessages.push(`- "${ing.name}" (no encontrado en inventario como materia prima).`);
        continue;
      }

      // Convertir la cantidad requerida de la receta a la unidad base del inventario item
      // La conversión ahora considera unit_value del inventario
      const requiredAmountConverted = convertUnits(
        requiredAmountRecipeBase * quantityToProduce, // Total requerido para la producción
        requiredUnitRecipe,
        inventoryItem.unit_type // Convertir a la unidad del inventario (ej. 'g', 'cc')
      );

      if (requiredAmountConverted === null) {
        canProduce = false;
        shortageMessages.push(`- Error de conversión de unidades para "${ing.name}".`);
        continue;
      }

      // Calcular stock total disponible en inventarioItem en su unidad base
      const currentStockTotalInBaseUnit = inventoryItem.stock * inventoryItem.unit_value;

      if (currentStockTotalInBaseUnit < requiredAmountConverted) {
        canProduce = false;
        shortageMessages.push(`- "${ing.name}": Necesitas ${requiredAmountConverted} ${inventoryItem.unit_type}, pero solo tienes ${currentStockTotalInBaseUnit} ${inventoryItem.unit_type}.`);
      }
      
      // Guardar la deducción en términos del stock del inventario (número de paquetes/unidades)
      const newStockForIngredient = (currentStockTotalInBaseUnit - requiredAmountConverted) / inventoryItem.unit_value;
      deductions.push({
          itemId: inventoryItem.id,
          newStock: newStockForIngredient
      });
    }

    const finishedProductInInventory = inventoryItems.find(item =>
      item.name.toLowerCase() === recipe.name.toLowerCase() && item.type === 'finished_good'
    );

    if (!canProduce) {
      showInfoModal(`No se puede iniciar la producción de ${quantityToProduce} ${recipe.name}(s) debido a escasez de ingredientes: \n${shortageMessages.join('\n')}\nPor favor, actualiza tu inventario. 🛒`);
      return; 
    }

    if (!window.confirm(`¿Confirmas la producción de ${quantityToProduce} unidad(es) de "${recipe.name}"? Esto deducirá los ingredientes de tu inventario.`)) {
      return; 
    }

    try {
      // Deducir cada ingrediente
      for (const deduction of deductions) {
        const itemRef = doc(db, `artifacts/${appId}/users/${userId}/inventory`, deduction.itemId);
        await updateDoc(itemRef, { stock: deduction.newStock });
      }

      // Añadir stock del producto terminado
      if (finishedProductInInventory) {
        const newStock = finishedProductInInventory.stock + quantityToProduce;
        const productRef = doc(db, `artifacts/${appId}/users/${userId}/inventory`, finishedProductInInventory.id);
        updatedInventoryPromises.push(updateDoc(productRef, { stock: newStock }));
      } else {
        const inventoryRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);
        updatedInventoryPromises.push(addDoc(inventoryRef, {
          name: recipe.name,
          unit_value: 1, // Por defecto, 1 unidad del producto terminado
          unit_type: 'unidad', 
          stock: quantityToProduce,
          type: 'finished_good',
          createdAt: new Date(),
        }));
      }

      await Promise.all(updatedInventoryPromises); 
      showInfoModal(`¡Producción de ${quantityToProduce} ${recipe.name}(s) confirmada! 🎉 Inventario actualizado.`);
      setProductionQuantity(1); 
    } catch (e) {
      console.error("Error during production confirmation:", e);
      showInfoModal('Error al confirmar la producción y actualizar el inventario. Por favor, revisa la consola para más detalles.');
    }
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-2xl border border-pink-100">
      <h2 className="text-3xl font-extrabold text-pink-800 mb-6 text-center">Gestión de Recetas 📝</h2>

      {/* Formulario de Recetas */}
      <div className="mb-8 p-6 bg-rose-50 rounded-2xl border border-rose-100 shadow-inner">
        <h3 className="text-2xl font-bold text-pink-700 mb-4">{editingRecipeId ? 'Editar Receta' : 'Añadir Nueva Receta'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="recipeName" className="block text-gray-700 text-sm font-semibold mb-2">Nombre de la Receta</label>
            <input
              type="text"
              id="recipeName"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={newRecipeName}
              onChange={(e) => setNewRecipeName(e.target.value)}
              placeholder="Ej: Galletas de Chispas"
            />
          </div>
          <div>
            <label htmlFor="recipeType" className="block text-gray-700 text-sm font-semibold mb-2">Tipo de Producto</label>
            <select
              id="recipeType"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={newRecipeType}
              onChange={(e) => setNewRecipeType(e.target.value)}
            >
              {recipeTypeOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <h4 className="text-xl font-bold text-pink-700 mb-3">Ingredientes:</h4>
        {newIngredients.map((ingredient, index) => (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3 p-3 border border-pink-100 rounded-lg bg-white shadow-sm">
            <div className="sm:col-span-2">
              <label htmlFor={`ingredientName-${index}`} className="block text-gray-600 text-xs font-medium mb-1">Nombre Ingrediente</label>
              <input
                type="text"
                id={`ingredientName-${index}`}
                className="w-full p-2 border border-pink-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-pink-400"
                value={ingredient.name}
                onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                list="inventoryItemSuggestions"
                placeholder="Ej: Harina"
              />
              <datalist id="inventoryItemSuggestions">
                {inventoryItems.filter(item => item.type === 'raw_material').map((item) => (
                  <option key={item.id} value={item.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor={`ingredientQuantity-${index}`} className="block text-gray-600 text-xs font-medium mb-1">Cantidad</label>
              <input
                type="number"
                id={`ingredientQuantity-${index}`}
                className="w-full p-2 border border-pink-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-pink-400"
                value={ingredient.quantity}
                onChange={(e) => handleIngredientChange(index, 'quantity', parseFloat(e.target.value) || '')}
                min="0"
                placeholder="100"
              />
            </div>
            <div className="flex items-end">
              <div className="flex-grow">
                <label htmlFor={`ingredientUnit-${index}`} className="block text-gray-600 text-xs font-medium mb-1">Unidad</label>
                <select
                  id={`ingredientUnit-${index}`}
                  className="w-full p-2 border border-pink-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-pink-400"
                  value={ingredient.unit}
                  onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                >
                  {unitOptions.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => handleRemoveIngredient(index)}
                className="ml-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200 shadow-md flex-shrink-0"
                aria-label="Eliminar ingrediente"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={handleAddIngredient}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition duration-200 shadow-md"
        >
          Añadir Otro Ingrediente
        </button>
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={resetForm}
            className="px-6 py-3 bg-gray-300 text-gray-800 rounded-xl hover:bg-gray-400 transition duration-200 shadow-lg font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={handleAddOrUpdateRecipe}
            className="px-6 py-3 bg-pink-600 text-white rounded-xl hover:bg-pink-700 transition duration-200 shadow-lg font-bold"
          >
            {editingRecipeId ? 'Actualizar Receta' : 'Guardar Receta'}
          </button>
        </div>
      </div>

      {/* Listado de Recetas */}
      <h3 className="text-2xl font-extrabold text-pink-800 mb-5 text-center">Listado de Recetas Existentes 📚</h3>
      {recipes.length === 0 ? (
        <p className="text-center text-gray-600 text-lg">No hay recetas registradas. ¡Empieza añadiendo una! 🌟</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recipes.map((recipe) => (
            <div key={recipe.id} className="bg-white p-6 rounded-3xl shadow-lg border border-pink-100 flex flex-col justify-between transform hover:scale-103 transition duration-300">
              <div>
                {/* Ajuste de emojis según las nuevas opciones de tipo */}
                <h4 className="text-xl font-bold text-pink-700 mb-2">{recipe.name} ({recipe.type === 'cookie' ? '🍪' : recipe.type === 'cake' ? '🎂' : recipe.type === 'reposteria' ? '🧁' : recipe.type === 'personalizados' ? '✨' : ''})</h4>
                <p className="text-gray-600 mb-3 text-sm">Tipo: <span className="font-semibold capitalize">{recipe.type === 'cookie' ? 'Galleta' : recipe.type === 'cake' ? 'Torta' : recipe.type === 'reposteria' ? 'Repostería' : recipe.type === 'personalizados' ? 'Personalizados' : recipe.type}</span></p>
                <p className="font-semibold text-gray-700 mb-2">Ingredientes:</p>
                <ul className="list-disc list-inside text-gray-600 text-sm mb-4">
                  {recipe.ingredients.map((ing, idx) => (
                    <li key={idx}>
                      {ing.name}: {ing.quantity} {ing.unit}
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Sección de Producción por Receta */}
              <div className="mt-4 pt-4 border-t border-pink-100">
                <p className="font-semibold text-pink-700 mb-2">Producir esta receta:</p>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={productionQuantity}
                    onChange={(e) => setProductionQuantity(parseInt(e.target.value) || 1)}
                    min="1"
                    className="w-20 p-2 border border-pink-200 rounded-lg text-sm text-center focus:outline-none focus:ring-1 focus:ring-pink-400"
                  />
                  <button
                    onClick={() => handleConfirmProduction(recipe, productionQuantity)}
                    className="flex-grow px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition duration-200 shadow-md text-sm"
                  >
                    Confirmar Producción ✅
                  </button>
                </div>
              </div>

              <div className="mt-4 flex justify-end space-x-2">
                <button
                  onClick={() => handleEditRecipe(recipe)}
                  className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition duration-200 shadow-md"
                  aria-label="Editar receta"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.103 8.355L4 17.5V14.076l6.207-6.207 3.427 3.427z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteRecipe(recipe.id)}
                  className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200 shadow-md"
                  aria-label="Eliminar receta"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && <InfoModal message={modalMessage} onClose={closeModal} />}
    </div>
  );
};


// SalesNote Component (Nuevo: Para notas de venta y control de pedidos)
const SalesNote = () => {
  const { db, userId, appId } = useContext(FirebaseContext);
  const [salesOrders, setSalesOrders] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]); // Para verificar productos terminados y deducir
  const [recipes, setRecipes] = useState([]); // Para la selección de recetas
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newOrderType, setNewOrderType] = useState('cake'); 
  const [selectedRecipeId, setSelectedRecipeId] = useState(''); // Nuevo estado para la receta seleccionada
  const [newProductDetails, setNewProductDetails] = useState(''); // Nuevo estado para detalles adicionales
  const [newOrderQuantity, setNewOrderQuantity] = useState('');
  const [newOrderDate, setNewOrderDate] = useState('');
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  // Product type options for sales note
  const salesNoteTypeOptions = [
    { value: 'cake', label: 'Torta 🎂' },
    { value: 'cookie', label: 'Galleta 🍪' },
    { value: 'reposteria', label: 'Repostería 🧁' },
    { value: 'personalizados', label: 'Personalizados ✨' }
  ];

  useEffect(() => {
    if (!db || !userId) return;

    // Escucha órdenes de venta
    const ordersRef = collection(db, `artifacts/${appId}/users/${userId}/sales_orders`);
    const unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSalesOrders(ordersData.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))); // Ordenar por fecha, más recientes primero
    }, (error) => {
      console.error("Error fetching sales orders:", error);
      showInfoModal('Error al cargar las notas de venta: ' + error.message);
    });

    // Escucha productos terminados en inventario
    const inventoryRef = collection(db, `artifacts/${appId}/users/${userId}/inventory`);
    const unsubscribeInventory = onSnapshot(inventoryRef, (snapshot) => {
      const itemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInventoryItems(itemsData.filter(item => item.type === 'finished_good'));
    }, (error) => console.error("Error fetching finished goods for sales note:", error));

    // Escucha recetas para el selector
    const recipesRef = collection(db, `artifacts/${appId}/users/${userId}/recipes`);
    const unsubscribeRecipes = onSnapshot(recipesRef, (snapshot) => {
      const recipesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecipes(recipesData.sort((a, b) => a.name.localeCompare(b.name)));
    }, (error) => console.error("Error fetching recipes for sales note:", error));


    return () => {
      unsubscribeOrders();
      unsubscribeInventory();
      unsubscribeRecipes();
    };
  }, [db, userId, appId]);

  const showInfoModal = (message) => {
    setModalMessage(message);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMessage('');
  };

  const handleAddOrUpdateOrder = async () => {
    if (!newCustomerName.trim() || !newOrderQuantity || !newOrderDate || (!selectedRecipeId && !newProductDetails.trim())) {
      showInfoModal('Por favor, selecciona una receta o introduce una descripción del producto.');
      return;
    }
    const quantity = parseInt(newOrderQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      showInfoModal('La cantidad debe ser un número positivo.');
      return;
    }

    try {
      const orderData = {
        customerName: newCustomerName,
        orderType: newOrderType,
        selectedRecipeId: selectedRecipeId || null, // Store selected recipe ID
        productDescription: newProductDetails, // Store additional details
        quantity: quantity,
        orderDate: newOrderDate,
        createdAt: new Date(),
        status: 'Pendiente' // Estado inicial del pedido
      };

      if (editingOrderId) {
        const orderRef = doc(db, `artifacts/${appId}/users/${userId}/sales_orders`, editingOrderId);
        await updateDoc(orderRef, orderData);
        showInfoModal('Nota de venta actualizada con éxito! ✍️');
      } else {
        const ordersRef = collection(db, `artifacts/${appId}/users/${userId}/sales_orders`);
        await addDoc(ordersRef, orderData);
        showInfoModal('Nota de venta añadida con éxito! 🎉');
      }
      resetForm();
    } catch (e) {
      console.error("Error adding/updating sales order: ", e);
      showInfoModal('Error al guardar la nota de venta. Inténtalo de nuevo.');
    }
  };

  const handleEditOrder = (order) => {
    setEditingOrderId(order.id);
    setNewCustomerName(order.customerName);
    setNewOrderType(order.orderType);
    setSelectedRecipeId(order.selectedRecipeId || '');
    setNewProductDetails(order.productDescription || '');
    setNewOrderQuantity(order.quantity.toString());
    setNewOrderDate(order.orderDate);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteOrder = async (id) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta nota de venta?')) {
      try {
        await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/sales_orders`, id));
        showInfoModal('Nota de venta eliminada con éxito! 🗑️');
      } catch (e) {
        console.error("Error removing sales order: ", e);
        showInfoModal('Error al eliminar la nota de venta. Inténtalo de nuevo.');
      }
    }
  };

  // Función para cambiar el estado del pedido y deducir inventario
  const handleChangeOrderStatus = async (orderId, currentStatus, selectedRecipeId, productDescription, quantity) => {
    if (!db || !userId) {
      showInfoModal('Error: No estás autenticado o la base de datos no está disponible.');
      return;
    }

    const newStatus = currentStatus === 'Pendiente' ? 'Completado' : 'Pendiente'; // Toggle status

    if (newStatus === 'Completado') {
      // Determinar el nombre del producto para la deducción
      let productNameForDeduction = productDescription; // Usar detalles si no hay receta
      if (selectedRecipeId) {
          const associatedRecipe = recipes.find(r => r.id === selectedRecipeId);
          if (associatedRecipe) {
              productNameForDeduction = associatedRecipe.name;
          }
      }

      // Intentar deducir del inventario de productos terminados
      const finishedProduct = inventoryItems.find(item => 
        item.name.toLowerCase() === productNameForDeduction.toLowerCase() && item.type === 'finished_good'
      );

      if (!finishedProduct) {
        showInfoModal(`No se puede completar el pedido: "${productNameForDeduction}" no encontrado como producto terminado en el inventario.`);
        return;
      }
      // Assuming finished goods are tracked as single 'unidad' (unit_value = 1)
      if (finishedProduct.stock < quantity) {
        showInfoModal(`No se puede completar el pedido de "${productNameForDeduction}": Stock insuficiente. Solo tienes ${finishedProduct.stock} ${finishedProduct.unit_type}(es), necesitas ${quantity}.`);
        return;
      }

      if (!window.confirm(`¿Confirmas que el pedido de "${productNameForDeduction}" por ${quantity} unidades está ${newStatus}? Esto deducirá del inventario de productos terminados.`)) {
        return; 
      }

      try {
        // Deducir del stock de productos terminados
        const newStock = finishedProduct.stock - quantity;
        const productRef = doc(db, `artifacts/${appId}/users/${userId}/inventory`, finishedProduct.id);
        await updateDoc(productRef, { stock: newStock });

        // Actualizar estado del pedido
        const orderRef = doc(db, `artifacts/${appId}/users/${userId}/sales_orders`, orderId);
        await updateDoc(orderRef, { status: newStatus });
        showInfoModal(`Pedido de "${productNameForDeduction}" actualizado a "${newStatus}"! Inventario deducido.`);

      } catch (e) {
        console.error("Error al cambiar el estado del pedido o deducir inventario:", e);
        showInfoModal('Error al actualizar el estado del pedido o inventario. Por favor, revisa la consola.');
      }

    } else { // Si el estado cambia de Completado a Pendiente
        if (!window.confirm(`¿Confirmas cambiar el estado a "Pendiente"? Esto NO revertirá el stock deducido.`)) {
          return;
        }
        try {
          const orderRef = doc(db, `artifacts/${appId}/users/${userId}/sales_orders`, orderId);
          await updateDoc(orderRef, { status: newStatus });
          showInfoModal(`Pedido de "${selectedRecipeId ? recipes.find(r => r.id === selectedRecipeId)?.name : productDescription}" actualizado a "${newStatus}".`);
        } catch (e) {
          console.error("Error al cambiar el estado del pedido:", e);
          showInfoModal('Error al actualizar el estado del pedido. Por favor, revisa la consola.');
        }
    }
  };


  const resetForm = () => {
    setEditingOrderId(null);
    setNewCustomerName('');
    setNewOrderType('cake');
    setSelectedRecipeId('');
    setNewProductDetails('');
    setNewOrderQuantity('');
    setNewOrderDate('');
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-2xl border border-pink-100">
      <h2 className="text-3xl font-extrabold text-pink-800 mb-6 text-center">Nota de Venta 🧾</h2>

      {/* Formulario de Nota de Venta */}
      <div className="mb-8 p-6 bg-rose-50 rounded-2xl border border-rose-100 shadow-inner">
        <h3 className="text-2xl font-bold text-pink-700 mb-4">{editingOrderId ? 'Editar Nota de Venta' : 'Crear Nueva Nota de Venta'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="customerName" className="block text-gray-700 text-sm font-semibold mb-2">Nombre del Cliente</label>
            <input
              type="text"
              id="customerName"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="Ej: Juan Pérez"
            />
          </div>
          <div>
            <label htmlFor="orderType" className="block text-gray-700 text-sm font-semibold mb-2">Tipo de Producto</label>
            <select
              id="orderType"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={newOrderType}
              onChange={(e) => setNewOrderType(e.target.value)}
            >
              {salesNoteTypeOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {/* Nueva sección para seleccionar receta y detalles */}
          <div>
            <label htmlFor="recipeSelect" className="block text-gray-700 text-sm font-semibold mb-2">Receta Asociada (Opcional)</label>
            <select
              id="recipeSelect"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={selectedRecipeId}
              onChange={(e) => setSelectedRecipeId(e.target.value)}
            >
              <option value="">-- Seleccionar Receta --</option>
              {recipes.map(recipe => (
                <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="productDetails" className="block text-gray-700 text-sm font-semibold mb-2">Detalles del Producto / Descripción</label>
            <textarea
              id="productDetails"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={newProductDetails}
              onChange={(e) => setNewProductDetails(e.target.value)}
              placeholder="Ej: Torta de chocolate 10 porciones, diseño especial de unicornio"
              rows="3"
            ></textarea>
          </div>
          <div>
            <label htmlFor="orderQuantity" className="block text-gray-700 text-sm font-semibold mb-2">Cantidad</label>
            <input
              type="number"
              id="orderQuantity"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={newOrderQuantity}
              onChange={(e) => setNewOrderQuantity(e.target.value)}
              min="1"
              placeholder="Ej: 1, 20"
            />
          </div>
          <div>
            <label htmlFor="orderDate" className="block text-gray-700 text-sm font-semibold mb-2">Fecha de Pedido</label>
            <input
              type="date"
              id="orderDate"
              className="w-full p-3 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
              value={newOrderDate}
              onChange={(e) => setNewOrderDate(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={resetForm}
            className="px-6 py-3 bg-gray-300 text-gray-800 rounded-xl hover:bg-gray-400 transition duration-200 shadow-lg font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={handleAddOrUpdateOrder}
            className="px-6 py-3 bg-pink-600 text-white rounded-xl hover:bg-pink-700 transition duration-200 shadow-lg font-bold"
          >
            {editingOrderId ? 'Actualizar Pedido' : 'Guardar Pedido'}
          </button>
        </div>
      </div>

      {/* Listado de Notas de Venta */}
      <h3 className="text-2xl font-extrabold text-pink-800 mb-5 text-center">Pedidos Existentes 📋</h3>
      {salesOrders.length === 0 ? (
        <p className="text-center text-gray-600 text-lg">No hay pedidos registrados aún. ¡Crea tu primera nota de venta! 🌟</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl shadow-lg border border-pink-100">
          <table className="min-w-full bg-white border-collapse">
            <thead className="bg-pink-100 border-b border-pink-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Receta Asociada</th> {/* Nueva columna */}
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Detalles del Producto</th> {/* Nueva columna */}
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Cantidad</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-pink-700 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-pink-700 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pink-50">
              {salesOrders.map((order) => (
                <tr key={order.id} className="hover:bg-pink-50 transition duration-150 ease-in-out">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{order.customerName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {order.selectedRecipeId ? recipes.find(r => r.id === order.selectedRecipeId)?.name : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.productDescription}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 capitalize">{order.orderType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.quantity}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.orderDate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                    <button
                      onClick={() => handleChangeOrderStatus(order.id, order.status, order.selectedRecipeId, order.productDescription, order.quantity)}
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${order.status === 'Pendiente' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' :
                          order.status === 'Completado' ? 'bg-green-100 text-green-800 hover:bg-green-200' :
                          'bg-gray-100 text-gray-800 hover:bg-gray-200'} transition duration-200`}
                    >
                      {order.status}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEditOrder(order)}
                      className="inline-flex items-center p-2 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-100 transition duration-200 mr-2"
                      aria-label="Editar pedido"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.103 8.355L4 17.5V14.076l6.207-6.207 3.427 3.427z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteOrder(order.id)}
                      className="inline-flex items-center p-2 rounded-lg text-red-600 hover:text-red-800 hover:bg-red-100 transition duration-200"
                      aria-label="Eliminar pedido"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && <InfoModal message={modalMessage} onClose={closeModal} />}
    </div>
  );
};

// Componente Conversor de Unidades (Nueva Página)
const UnitConverterPage = () => {
  const [value, setValue] = useState(1);
  const [fromUnit, setFromUnit] = useState('g');
  const [toUnit, setToUnit] = useState('g');
  const [result, setResult] = useState('Resultado: ');
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  // Opciones de unidades para el conversor (incluye todas las posibles)
  const converterUnitOptions = ['g', 'kg', 'ml', 'lt', 'cc', 'unidad'];

  const showInfoModal = (message) => {
    setModalMessage(message);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMessage('');
  };

  const handleConvert = () => {
    const numericValue = parseFloat(value);
    if (isNaN(numericValue) || numericValue < 0) {
      showInfoModal('Por favor, ingresa un valor numérico positivo.');
      setResult('Resultado: Valor inválido');
      return;
    }

    const converted = convertUnits(numericValue, fromUnit, toUnit);

    if (converted !== null) {
      setResult(`Resultado: ${converted.toFixed(2)} ${toUnit}`);
    } else {
      setResult('Resultado: Conversión no compatible');
      showInfoModal('Las unidades seleccionadas no son compatibles para conversión (ej. no se puede convertir gramos a litros).');
    }
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-2xl border border-pink-100">
      <h2 className="text-3xl font-extrabold text-pink-800 mb-6 text-center">Conversor de Unidades 🔄</h2>
      <p className="text-center text-gray-600 mb-8">
        Convierte fácilmente entre diferentes unidades de medida (gramos, kilogramos, mililitros, litros y centímetros cúbicos).
      </p>

      <div className="max-w-md mx-auto p-6 bg-cyan-50 rounded-2xl shadow-md border border-cyan-100 space-y-4">
        <div>
          <label htmlFor="convert-value" className="block text-sm font-medium text-slate-700 mb-2">Valor a Convertir:</label>
          <input
            type="number"
            id="convert-value"
            value={value}
            onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
            min="0"
            className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 text-center text-lg"
          />
        </div>
        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="flex-1 w-full">
            <label htmlFor="from-unit" className="block text-sm font-medium text-slate-700 mb-2">De Unidad:</label>
            <select
              id="from-unit"
              className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
              value={fromUnit}
              onChange={(e) => setFromUnit(e.target.value)}
            >
              {converterUnitOptions.map(unit => (
                <option key={unit} value={unit}>{unit.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="text-2xl text-slate-600 sm:mt-6">→</div>
          <div className="flex-1 w-full">
            <label htmlFor="to-unit" className="block text-sm font-medium text-slate-700 mb-2">A Unidad:</label>
            <select
              id="to-unit"
              className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
              value={toUnit}
              onChange={(e) => setToUnit(e.target.value)}
            >
              {converterUnitOptions.map(unit => (
                <option key={unit} value={unit}>{unit.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleConvert}
          // Modificaciones aquí para hacer el botón más visible
          className="px-8 py-4 bg-pink-600 text-white font-bold text-lg rounded-xl hover:bg-pink-700 transition duration-300 transform hover:scale-105 shadow-xl w-full mt-4"
        >
          Convertir
        </button>
        <div className="mt-4 p-4 bg-white rounded-lg border border-slate-200 text-center">
          <span className="text-xl font-bold text-cyan-700" id="conversion-result">{result}</span>
        </div>
      </div>
      {showModal && <InfoModal message={modalMessage} onClose={closeModal} />}
    </div>
  );
};


// Componente Modal de Información (Reutilizable)
const InfoModal = ({ message, onClose }) => {
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center border border-gray-200 transform scale-105 animate-fade-in-up">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Información</h3>
        <p className="text-gray-700 mb-6">{message}</p>
        <button
          onClick={onClose}
          className="px-6 py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition duration-200 shadow-lg font-semibold"
        >
          Entendido
        </button>
      </div>
    </div>
  );
};

export default App;
