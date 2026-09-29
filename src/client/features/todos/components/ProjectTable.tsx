import React, { useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

import { projectsApi } from '../api/projectApi';
import { useAuth } from '../../auth/AuthProvider';

export type Project = {
  id: string;
  name: string;
  userId: string | null;
  usersEmail: string[] | null;
  createdAt: Date;
};

interface ProjectTableProps {
  projects: Project[];
  onUpdated?: () => void;
}

export default function ProjectTable({
  projects,
  onUpdated,
}: ProjectTableProps) {
  const [selectedProject, setSelectedProject] =
    useState<Project | null>(null);
  const { user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Emails actuellement affichés dans le modal
  const [usersEmail, setUsersEmail] = useState<string[]>([]);

  // Emails présents au moment de l'ouverture du modal
  const [initialUsersEmail, setInitialUsersEmail] =
    useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /*
   * ID de l'utilisateur actuellement connecté.
   *
   * Adapte cette ligne selon la manière dont ton application
   * récupère l'utilisateur connecté.
   */
  const currentUserId = user?.id;

  /**
   * Ouvre le modal de modification
   */
  const handleOpenEdit = (project: Project) => {
    const projectEmails = project.usersEmail ?? [];

    setSelectedProject(project);
    setName(project.name);
    setEmail('');

    // Copie des emails pour pouvoir les modifier localement
    setUsersEmail([...projectEmails]);

    // On garde une copie pour savoir ce qui a changé
    setInitialUsersEmail([...projectEmails]);

    setError('');
    setEditOpen(true);
  };

  /**
   * Ferme le modal de modification
   */
  const handleCloseEdit = () => {
    if (loading) return;

    setEditOpen(false);
    setSelectedProject(null);

    setName('');
    setEmail('');

    setUsersEmail([]);
    setInitialUsersEmail([]);

    setError('');
  };

  /**
   * Ajoute un utilisateur dans le state local.
   *
   * Aucun appel API ici.
   * L'appel sera effectué au clic sur "Enregistrer".
   */
  const handleAddUser = () => {
    const normalizedEmail = email
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      setError("L'email est obligatoire.");
      return;
    }

    if (!normalizedEmail.includes('@')) {
      setError(
        'Veuillez entrer une adresse email valide.',
      );
      return;
    }

    const alreadyExists = usersEmail.some(
      (currentEmail) =>
        currentEmail.toLowerCase() === normalizedEmail,
    );

    if (alreadyExists) {
      setError(
        'Cet utilisateur est déjà dans le projet.',
      );
      return;
    }

    setUsersEmail((current) => [
      ...current,
      normalizedEmail,
    ]);

    setEmail('');
    setError('');
  };

  /**
   * Supprime un utilisateur du state local.
   *
   * Aucun appel API ici.
   * L'appel sera effectué au clic sur "Enregistrer".
   */
  const handleRemoveUser = (userEmail: string) => {
    setUsersEmail((current) =>
      current.filter(
        (currentEmail) => currentEmail !== userEmail,
      ),
    );

    setError('');
  };

  /**
   * Enregistre toutes les modifications.
   *
   * - PATCH si le nom a changé
   * - POST pour les nouveaux utilisateurs
   * - DELETE pour les utilisateurs supprimés
   */
  const handleUpdateProject = async () => {
    if (!selectedProject) return;

    const projectName = name.trim();

    if (!projectName) {
      setError(
        'Le nom du projet est obligatoire.',
      );
      return;
    }

    try {
      setLoading(true);
      setError('');

      /*
       * ============================
       * 1. MODIFICATION DU NOM
       * ============================
       */
      if (projectName !== selectedProject.name) {
        await projectsApi.update(
          selectedProject.id,
          {
            name: projectName,
          },
        );
      }

      /*
       * ============================
       * 2. UTILISATEURS AJOUTÉS
       * ============================
       */
      const usersToAdd = usersEmail.filter(
        (currentEmail) =>
          !initialUsersEmail.some(
            (initialEmail) =>
              initialEmail.toLowerCase() ===
              currentEmail.toLowerCase(),
          ),
      );

      /*
       * ============================
       * 3. UTILISATEURS SUPPRIMÉS
       * ============================
       */
      const usersToRemove =
        initialUsersEmail.filter(
          (initialEmail) =>
            !usersEmail.some(
              (currentEmail) =>
                currentEmail.toLowerCase() ===
                initialEmail.toLowerCase(),
            ),
        );

      /*
       * ============================
       * 4. AJOUT DES UTILISATEURS
       * ============================
       */
      await Promise.all(
        usersToAdd.map((userEmail) =>
          projectsApi.addUser(
            selectedProject.id,
            userEmail,
          ),
        ),
      );

      /*
       * ============================
       * 5. SUPPRESSION DES UTILISATEURS
       * ============================
       */
      await Promise.all(
        usersToRemove.map((userEmail) =>
          projectsApi.removeUser(
            selectedProject.id,
            userEmail,
          ),
        ),
      );

      /*
       * ============================
       * 6. FERMETURE DU MODAL
       * ============================
       */
      setEditOpen(false);
      setSelectedProject(null);

      setName('');
      setEmail('');
      setUsersEmail([]);
      setInitialUsersEmail([]);

      /*
       * ============================
       * 7. RECHARGEMENT DES PROJETS
       * ============================
       */
      onUpdated?.();
    } catch (cause) {
      console.error(cause);

      setError(
        'Impossible de modifier le projet.',
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Ouvre le modal de suppression
   */
  const handleOpenDelete = (project: Project) => {
    setSelectedProject(project);
    setError('');
    setDeleteOpen(true);
  };

  /**
   * Ferme le modal de suppression
   */
  const handleCloseDelete = () => {
    if (loading) return;

    setDeleteOpen(false);
    setSelectedProject(null);
    setError('');
  };

  /**
   * Supprime le projet
   */
  const handleDeleteProject = async () => {
    if (!selectedProject) return;

    try {
      setLoading(true);
      setError('');

      await projectsApi.remove(
        selectedProject.id,
      );

      setDeleteOpen(false);
      setSelectedProject(null);

      onUpdated?.();
    } catch (cause) {
      console.error(cause);

      setError(
        'Impossible de supprimer le projet.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* =====================================================
          TABLEAU DES PROJETS
          ===================================================== */}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                Nom
              </TableCell>

              <TableCell>
                Utilisateurs
              </TableCell>

              <TableCell>
                Date de création
              </TableCell>

              <TableCell align="right">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  align="center"
                >
                  <Typography
                    color="text.secondary"
                  >
                    Aucun projet
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => {
                /*
                 * Seul le créateur du projet peut
                 * le modifier ou le supprimer.
                 */
                const isProjectCreator =
                  project.userId === currentUserId;

                return (
                  <TableRow
                    key={project.id}
                    hover
                  >
                    {/* NOM */}
                    <TableCell>
                      <Typography
                        fontWeight={600}
                      >
                        {project.name}
                      </Typography>
                    </TableCell>

                    {/* UTILISATEURS */}
                    <TableCell>
                      <Box
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0.75,
                        }}
                      >
                        {project.usersEmail?.length ? (
                          project.usersEmail.map(
                            (userEmail) => (
                              <Chip
                                key={userEmail}
                                label={userEmail}
                                size="small"
                              />
                            ),
                          )
                        ) : (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                          >
                            Aucun utilisateur
                          </Typography>
                        )}
                      </Box>
                    </TableCell>

                    {/* DATE */}
                    <TableCell>
                      {new Date(
                        project.createdAt,
                      ).toLocaleDateString(
                        'fr-FR',
                        {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        },
                      )}
                    </TableCell>

                    {/* ACTIONS */}
                    <TableCell align="right">
                      {/* MODIFIER */}
                      <Tooltip
                        title={
                          isProjectCreator
                            ? 'Modifier le projet'
                            : 'Seul le créateur du projet peut le modifier'
                        }
                      >
                        <span>
                          <IconButton
                            color="primary"
                            onClick={() =>
                              handleOpenEdit(
                                project,
                              )
                            }
                            disabled={
                              !isProjectCreator
                            }
                          >
                            <EditIcon />
                          </IconButton>
                        </span>
                      </Tooltip>

                      {/* SUPPRIMER */}
                      <Tooltip
                        title={
                          isProjectCreator
                            ? 'Supprimer le projet'
                            : 'Seul le créateur du projet peut le supprimer'
                        }
                      >
                        <span>
                          <IconButton
                            color="error"
                            onClick={() =>
                              handleOpenDelete(
                                project,
                              )
                            }
                            disabled={
                              !isProjectCreator
                            }
                          >
                            <DeleteIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* =====================================================
          MODAL MODIFICATION
          ===================================================== */}

      <Dialog
        open={editOpen}
        onClose={handleCloseEdit}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Modifier le projet
        </DialogTitle>

        <DialogContent>
          <Stack
            spacing={3}
            sx={{ mt: 1 }}
          >
            {/* ERREUR */}
            {error && (
              <Alert severity="error">
                {error}
              </Alert>
            )}

            {/* NOM DU PROJET */}
            <TextField
              label="Nom du projet"
              value={name}
              onChange={(event) =>
                setName(
                  event.target.value,
                )
              }
              fullWidth
              disabled={loading}
            />

            {/* UTILISATEURS */}
            <Box>
              <Typography
                variant="subtitle1"
                fontWeight={600}
                sx={{ mb: 1 }}
              >
                Utilisateurs
              </Typography>

              {/* AJOUT EMAIL */}
              <Stack
                direction="row"
                spacing={1}
                sx={{ mb: 2 }}
              >
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddUser();
                    }
                  }}
                  fullWidth
                  disabled={loading}
                />

                <Button
                  variant="contained"
                  startIcon={
                    <PersonAddIcon />
                  }
                  onClick={
                    handleAddUser
                  }
                  disabled={loading}
                >
                  Ajouter
                </Button>
              </Stack>

              {/* LISTE DES EMAILS */}
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                flexWrap="wrap"
              >
                {usersEmail.length > 0 ? (
                  usersEmail.map(
                    (userEmail) => (
                      <Chip
                        key={userEmail}
                        label={userEmail}
                        onDelete={() =>
                          handleRemoveUser(
                            userEmail,
                          )
                        }
                        disabled={loading}
                      />
                    ),
                  )
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Aucun utilisateur
                  </Typography>
                )}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={handleCloseEdit}
            disabled={loading}
          >
            Annuler
          </Button>

          <Button
            variant="contained"
            onClick={
              handleUpdateProject
            }
            disabled={loading}
          >
            {loading
              ? 'Enregistrement...'
              : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* =====================================================
          MODAL SUPPRESSION
          ===================================================== */}

      <Dialog
        open={deleteOpen}
        onClose={handleCloseDelete}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          Supprimer le projet ?
        </DialogTitle>

        <DialogContent>
          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
            >
              {error}
            </Alert>
          )}

          <Typography>
            Êtes-vous sûr de vouloir
            supprimer le projet{' '}
            <strong>
              {selectedProject?.name}
            </strong>{' '}
            ?
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 1 }}
          >
            Cette action est irréversible.
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={handleCloseDelete}
            disabled={loading}
          >
            Annuler
          </Button>

          <Button
            color="error"
            variant="contained"
            onClick={
              handleDeleteProject
            }
            disabled={loading}
          >
            {loading
              ? 'Suppression...'
              : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
