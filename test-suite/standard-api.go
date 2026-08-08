package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	_ "github.com/lib/pq"
)

type UserResponse struct {
	Status   string `json:"status"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

func initDatabase() (*sql.DB, error) {
	dbUrl := os.Getenv("DATABASE_URL")
	if dbUrl == "" {
		dbUrl = "postgres://postgres:postgres@localhost:5432/appdb?sslmode=disable"
	}
	return sql.Open("postgres", dbUrl)
}

func userProfileHandler(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, "Missing username parameter", http.StatusBadRequest)
		return
	}

	resp := UserResponse{
		Status:   "active",
		Username: username,
		Email:    fmt.Sprintf("%s@example.com", username),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, `{"status":"up"}`)
}

func main() {
	db, err := initDatabase()
	if err != nil {
		fmt.Printf("Database connection initialized: %v\n", err)
	} else {
		defer db.Close()
	}

	http.HandleFunc("/api/user", userProfileHandler)
	http.HandleFunc("/health", healthCheckHandler)

	fmt.Println("Server starting on port 8080...")
	http.ListenAndServe(":8080", nil)
}
