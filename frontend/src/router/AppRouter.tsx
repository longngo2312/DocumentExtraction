import {
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
} from "react-router-dom";
import Layout from "../components/layout/Layout";
import DashboardPage from "../pages/DashboardPage";
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
// A data router rather than <BrowserRouter>: the schema editor's
// unsaved-changes guard needs useBlocker, which only data routers support.
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/schemas" element={<SchemaBuilderPage />} />
          {/* Static segment first so "new" can't be read as an :id. */}
          <Route
            path="/schemas/new"
            element={<SchemaEditorPage mode="create" />}
          />
          <Route path="/schemas/:id" element={<SchemaDetailPage />} />
          <Route
            path="/schemas/:id/edit"
            element={<SchemaEditorPage mode="edit" />}
          />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/documents" element={<DocumentGridPage />} />
          <Route path="/documents/:id" element={<ExtractedDocumentPage />} />
          <Route path="/query" element={<QueryPage />} />
          {/* Each chat has a URL, so a reload or a shared link reopens it. */}
          <Route path="/query/:sessionId" element={<QueryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {/* Without this an unknown path renders a completely blank page. */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </>,
  ),
);

function AppRouter() {
  return <RouterProvider router={router} />;
}

export default AppRouter;
