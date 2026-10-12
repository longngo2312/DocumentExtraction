import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import Layout from "../components/layout/Layout";
import DocumentGridPage from "../pages/DocumentGridPage";
import ExtractedDocumentPage from "../pages/ExtractedDocumentPage";
import LoginPage from "../pages/LoginPage";
import NotFoundPage from "../pages/NotFoundPage";
import ProfilePage from "../pages/ProfilePage";
import QueryPage from "../pages/QueryPage";
import RegisterPage from "../pages/RegisterPage";
import SchemaBuilderPage from "../pages/SchemaBuilderPage";
import SchemaDetailPage from "../pages/SchemaDetailPage";
import SchemaEditorPage from "../pages/SchemaEditorPage";
import UploadPage from "../pages/UploadPage";
import { useAuthStore } from "../stores/authStore";

function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}
function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/schemas" element={<SchemaBuilderPage />} />
            {/* Static segment first so "new" can't be read as an :id. */}
            <Route path="/schemas/new" element={<SchemaEditorPage mode="create" />} />
            <Route path="/schemas/:id" element={<SchemaDetailPage />} />
            <Route
              path="/schemas/:id/edit"
              element={<SchemaEditorPage mode="edit" />}
            />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/documents" element={<DocumentGridPage />} />
            <Route path="/documents/:id" element={<ExtractedDocumentPage />} />
            <Route path="/query" element={<QueryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/" element={<Navigate to="/schemas" replace />} />
            {/* Without this an unknown path renders a completely blank page. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;
